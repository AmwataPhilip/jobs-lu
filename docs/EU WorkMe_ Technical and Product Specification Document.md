# **EU WorkMe: Technical & Product Specification Document**

**Target Audience:** Autonomous AI Software Engineer / Code Generation Agent  
**Project Directive:** This document serves as the authoritative, end-to-end blueprint for building **EU WorkMe**, a highly specialized, closed-ecosystem job aggregation, matching, and application platform. The system is designed with zero requirement for monetization, public scalability, or generic user onboarding. Its singular operational directive is to algorithmically source, filter, and facilitate the acquisition of high-paying, high-relevance positions within the Grand Duchy of Luxembourg (and the Greater Region) for exactly two predefined users: Philip Amwata and Chiara Witry.

## **1\. Core System Objectives & Constraints**

> * **Hyper-Targeted Sourcing:** The system must aggressively scrape and filter opportunities prioritizing Luxembourg's structural advantages (e.g., average gross salaries exceeding €75k, high-value tech and ESG roles).  
> * **Zero-Friction Application:** The platform will automate the translation of the users' backgrounds into ESCO-compliant (European Skills, Competences, Qualifications and Occupations) semantic structures to bypass ATS (Applicant Tracking System) keyword filters.  
> * **Compliance Awareness:** The platform must surface and calculate the implications of the Luxembourg cross-border tax (34-day limit) and social security (49.9% telework) rules for any hybrid roles discovered.

## **2\. User Personas & Algorithmic Matching Logic**

The AI builder must hardcode or deeply embed the ontological profiles of the two users to ensure the matching engine retrieves only precision-fit roles.

| Attribute | Profile A: Philip Amwata | Profile B: Chiara Witry   |
| :---- | :---- | :---- |
| **Domain** | Deep-Tech, Fintech, Software Engineering | Anthropology, ESG, Talent Acquisition, DEI |
| **Core Technical Skills** | C++, Angular, .NET 6, TypeScript, Causal AI, Cloud Infrastructure | Talent Sourcing, Social Research, DEI Strategy, Corporate Sustainability |
| **Primary Target Roles** | AI Architect, Full-Stack Lead, Risk Reporting Engineer, DevSecOps | ESG Impact Specialist, Head of Talent Acquisition, Diversity Lead |
| **Target Institutions** | European Investment Bank (EIB), SnT (University of Luxembourg), Fintech Startups | EIB, Amazon LU, Multinationals (e.g., Birkenstock EU HQ) |
| **Salary Baseline Target** | €85,000+ Gross Annual | €80,000+ Gross Annual |

## **3\. Technical Architecture & Stack**

The AI builder will implement the following technology stack to ensure rapid development, robust scraping capabilities, and advanced LLM-based parsing.

> * **Backend / Data Ingestion:** Python 3.11+ using FastAPI. Chosen for native compatibility with AI libraries, web scraping tools, and rapid JSON serialization.  
> * **Database & Vector Storage:** PostgreSQL equipped with the pgvector extension. Traditional keyword matching is insufficient; job descriptions must be embedded and mapped via cosine similarity to the users' ESCO skill profiles.  
> * **Frontend Interface:** Next.js (React) with Tailwind CSS. The UI should be utilitarian, dark-mode preferred, focusing on data density (similar to a financial terminal) rather than commercial aesthetics.  
> * **AI Intelligence Layer:** Integration with OpenAI API (GPT-4o) or Google Gemini API for dynamic cover letter generation and job requirement extraction.

## **4\. Module Specifications: Step-by-Step AI Implementation**

### **Module A: Data Ingestion & Market Aggregation Pipeline**

The platform must continuously pull data from official and specialized Luxembourg channels. The AI is instructed to build a daily cron job that executes the following:

> 1. **EURES API Integration:** Implement POST requests to the EURES OpenAPI specification (/jv-searchengine/public/jv-search/search). Filter explicitly by NUTS 2024 regional codes corresponding to Luxembourg (LU00) and immediately adjacent border regions.  
> 2. **Apify Scraping Agents:** Utilize serverless Apify actors to bypass bot protection on specialized portals. Target *Silicon Luxembourg* for Philip's deep-tech roles and the *EIB official careers portal* for both Philip and Chiara.

**Data Model Schema (Job Vacancy):**

{  
  "job\_id": "uuid",  
  "source": "string (e.g., EURES, EIB\_Portal)",  
  "title": "string",  
  "employer": "string",  
  "location": {  
    "country": "LU",  
    "city": "string",  
    "allows\_telework": "boolean",  
    "telework\_percentage\_max": "float"  
  },  
  "raw\_description": "text",  
  "extracted\_skills": \["array of ESCO URIs"\],  
  "estimated\_salary": "float",  
  "matched\_persona": "enum(Philip, Chiara)",  
  "match\_score": "float (0.0 to 1.0)"  
}

### **Module B: The Semantic Matching & Profiling Engine**

The AI builder must construct an evaluation pipeline that analyzes incoming job descriptions against Philip and Chiara's profiles.

> * **ESCO Mapping:** Pass the scraped raw\_description through an LLM to extract requested skills, immediately mapping them to official ESCO terms (e.g., "Full Stack" \-\> http://data.europa.eu/esco/occupation/...).  
> * **The "Métiers en Pénurie" Filter:** The engine must cross-reference Luxembourg's ADEM shortage occupation list. Jobs on this list should receive a boosted match\_score as they bypass local labor market testing, ensuring rapid hiring.

### **Module C: Auto-Application & Document Generation**

When a job exceeds a match\_score of 0.85, the system will trigger the Auto-Application workflow.

> * **Dynamic CV Assembly:** Utilize the European Learning Model (ELM) XML/RDF schemas. Based on the job description, the system dynamically reorders Philip or Chiara's bullet points to highlight the most relevant experience first. (e.g., Emphasize causal AI for a risk management role, but emphasize .NET architecture for a backend role).  
> * **Context-Aware Cover Letters:** The LLM generates a cover letter that directly addresses the employer's specific requirements, integrating nuances about Luxembourg's market (e.g., acknowledging the multi-lingual environment or cross-border dynamics).

### **Module D: Cross-Border & Telework Compliance Calculator**

The application interface must display a "Compliance Health" dashboard for every job offering remote work.

> * **The 49.9% Alert:** If a job description implies 3 or more days of remote work per week for a non-resident, flag the role with a high-priority warning regarding the CCSS social security threshold.  
> * **The 34-Day Tax Rule:** Calculate the financial impact if remote days exceed 34 days annually, visualizing the dual-taxation complexity for residents of France, Germany, or Belgium.

## **5\. AI Execution Instructions**

**To the AI Code Generation Agent executing this document:**

> 1. Initialize a git repository and output a complete docker-compose.yml encompassing the PostgreSQL database and FastAPI backend.  
> 2. Generate the database models via SQLAlchemy or SQLModel based on the Data Model Schema provided in Module A.  
> 3. Construct the EURES API ingestion script using standard Python requests, implementing robust error handling and NUTS code filtering for Luxembourg.  
> 4. Develop the LLM-powered matching algorithm (Module B) utilizing a predefined prompt template that injects Philip and Chiara's JSON-formatted CV data against the scraped job descriptions.  
> 5. Output the React/Next.js frontend code to render a two-pane dashboard: one pane for Philip's matched roles and one for Chiara's.