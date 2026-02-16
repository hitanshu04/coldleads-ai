"""
ColdLeads AI — Generate personalized cold emails to a company's CTO.
"""

from langchain_core.messages import HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from tavily import TavilyClient
from pydantic import BaseModel, HttpUrl
from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, HTTPException
from urllib.parse import urlparse
import os
import time
import random
from dotenv import load_dotenv

#Load env. variables
load_dotenv()

app = FastAPI(title="ColdLeads", description="AI Sales Agent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_tavily_client: TavilyClient | None = None
_llm: ChatGoogleGenerativeAI | None = None


def get_tavily() -> TavilyClient:
    global _tavily_client
    if _tavily_client is None:
        key = os.getenv("TAVILY_API_KEY")
        if not key:
            raise HTTPException(
                status_code=503, detail="TAVILY_API_KEY not set.")
        _tavily_client = TavilyClient(api_key=key)
    return _tavily_client


def get_llm() -> ChatGoogleGenerativeAI:
    global _llm
    if _llm is None:
        key = os.getenv("GOOGLE_API_KEY")
        if not key:
            raise HTTPException(
                status_code=503, detail="GOOGLE_API_KEY not set.")
        # Trying the specific preview model from your list which often has separate quota
        _llm = ChatGoogleGenerativeAI(
            model="models/gemini-2.0-flash-lite-preview-09-2025",
            temperature=0.3,
            google_api_key=key,
        )
    return _llm


def _get_invoke_text(response) -> str:
    if response is None:
        return ""
    if isinstance(response, list):
        response = response[0] if response else None
    content = getattr(response, "content", response)
    if isinstance(content, list):
        text_parts = []
        for block in content:
            if isinstance(block, dict) and 'text' in block:
                text_parts.append(block['text'])
            elif isinstance(block, str):
                text_parts.append(block)
        return "".join(text_parts).strip()
    return str(content).strip()


async def call_gemini_safe(prompt_text: str):
    """
    Tries to call Gemini. If it fails (Quota/Error), returns None instead of crashing.
    """
    llm = get_llm()
    try:
        response = await llm.ainvoke([HumanMessage(content=prompt_text)])
        return _get_invoke_text(response)
    except Exception as e:
        print(f"⚠️ API Error (falling back to template): {e}")
        return None  # Return None so we know to use the template


def url_to_company_name(url: str) -> str:
    parsed = urlparse(url)
    netloc = parsed.netloc or parsed.path
    if netloc.lower().startswith("www."):
        netloc = netloc[4:]
    name = netloc.split(".")[0] if netloc else "Company"
    return name.strip().title() or "Company"


def summarize_company_from_results(results: list) -> str:
    if not results:
        return "The company."
    parts = []
    for r in results[:3]:
        content = (r.get("content") or r.get("title") or "").strip()
        if content:
            parts.append(content[:500])
    return " ".join(parts)[:1500] if parts else "The company."


class GenerateLeadInput(BaseModel):
    url: HttpUrl


class GenerateLeadOutput(BaseModel):
    cto: str
    email_draft: str
    company_pulse: str = ""


@app.post("/generate-lead", response_model=GenerateLeadOutput)
async def generate_lead(body: GenerateLeadInput):
    target_url = str(body.url)
    company_name = url_to_company_name(target_url)

    try:
        tavily = get_tavily()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Search unavailable: {e}")

    # 1) Search Site
    try:
        site_response = tavily.search(f"site:{target_url}", max_results=5)
    except:
        pass

    # 2) Search CTO
    cto_name = "The Hiring Manager"
    try:
        cto_response = tavily.search(
            f'CTO of {company_name} LinkedIn', max_results=4)
        cto_results = cto_response.get("results") or []
        cto_text = " ".join((r.get("content") or "") for r in cto_results)

        prompt_cto = f"""Extract the full name of the CTO of {company_name} from:
        {cto_text[:3000]}
        Return ONLY the name. If not found, return NONE."""

        # Try AI extraction
        found_name = await call_gemini_safe(prompt_cto)

        if found_name and "NONE" not in found_name.upper() and len(found_name) > 2:
            cto_name = found_name.strip()
            if "{" in cto_name:  # Clean JSON junk
                import json
                try:
                    cto_name = json.loads(cto_name).get('text', cto_name)
                except:
                    pass
    except Exception:
        pass  # Keep "Hiring Manager" if search breaks

    # 3) Search News
    news_snippet = "recent growth and innovation"
    try:
        news_response = tavily.search(
            f"latest business and technology news about {company_name} software company",
            max_results=3, topic="news"
        )
        if news_response.get("results"):
            news_snippet = news_response["results"][0].get("content", "")[:500]
    except:
        pass

    # 4) Draft Email (With Safe Fallback)
    prompt_email = (
        f"Write a short, punchy cold email to {cto_name} at {company_name}. "
        f"Mention their recent news: {news_snippet}. "
        "Pitch my services as a GenAI Intern who can automate their internal workflows. "
        "My name is Hitanshu. Keep it under 150 words."
    )

    # Try AI Generation
    email_draft = await call_gemini_safe(prompt_email)

    # SAFETY NET: If AI failed (None), use this perfect template
    if not email_draft:
        print("⚡ Quota exhausted. Using Fallback Template.")
        email_draft = (
            f"Hi {cto_name},\n\n"
            f"I've been following {company_name}'s recent updates regarding {news_snippet[:30]}... and saw an opportunity to accelerate your internal tooling.\n\n"
            "I am a GenAI engineer specializing in building autonomous agents that streamline workflows. "
            "I'd love to help your engineering team ship faster by automating the repetitive tasks slowing them down.\n\n"
            "Open to a 10-min chat?\n\n"
            "Best,\n"
            "Hitanshu"
        )

    return GenerateLeadOutput(
        cto=cto_name,
        email_draft=email_draft,
        company_pulse=news_snippet,
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
