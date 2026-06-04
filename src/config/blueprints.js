import { WORKSPACE_TYPES } from './workspace'

export const BLUEPRINTS = {
  [WORKSPACE_TYPES.CREATIVE]: [
    {
      id: 'creative_three_act',
      name: 'Standard Three-Act Story Structure',
      description: 'A classic story model divided into Setup, Confrontation, and Resolution.',
      sections: [
        {
          title: 'Act I: Setup',
          summary: 'Introduce the protagonist, their ordinary world, and the inciting incident that calls them to action.',
          subsections: [
            {
              title: 'Chapter 1: The Ordinary World',
              summary: 'Establish the status quo and character motivations.',
              content: '## Chapter 1: The Ordinary World\n\nIntroduce the protagonist in their daily life. Show their personality, their flaws, and what they secretly long for...'
            },
            {
              title: 'Chapter 2: The Inciting Incident',
              summary: 'An event disrupts the ordinary world and forces the protagonist out of comfort.',
              content: '## Chapter 2: The Call to Adventure\n\nA sudden shift occurs. The protagonist faces a choice, a threat, or a mystery that they cannot ignore...'
            }
          ]
        },
        {
          title: 'Act II: Confrontation',
          summary: 'The protagonist enters the new world, faces rising stakes, obstacles, and the midpoint climax.',
          subsections: [
            {
              title: 'Chapter 3: Crossing the Threshold',
              summary: 'Protagonist commits to the journey and enters the unknown territory.',
              content: '## Chapter 3: Entering the Storm\n\nThere is no turning back. The boundaries of the old world fade behind them as they face their first trial...'
            },
            {
              title: 'Chapter 4: The Midpoint Climax',
              summary: 'A major revelation or shift in stakes changes the trajectory of the plot.',
              content: '## Chapter 4: The Pivot Point\n\nAn unexpected truth comes to light. The stakes are raised, and the protagonist must double their resolve...'
            }
          ]
        },
        {
          title: 'Act III: Resolution',
          summary: 'The climax, the dark night of the soul, and the ultimate resolution of the story arc.',
          subsections: [
            {
              title: 'Chapter 5: The Climax',
              summary: 'The final confrontation between protagonist and antagonist.',
              content: '## Chapter 5: The Reckoning\n\nAll threads lead here. The protagonist must apply everything they have learned in a final, defining confrontation...'
            }
          ]
        }
      ]
    }
  ],
  [WORKSPACE_TYPES.LEGAL]: [
    {
      id: 'legal_nda',
      name: 'Mutual Nondisclosure Agreement (NDA)',
      description: 'Standard agreement for business partnerships requiring confidentiality and asset protection.',
      sections: [
        {
          title: '1. Preamble & Purpose',
          summary: 'Identifies the parties involved, the date of agreement, and the general business purpose.',
          subsections: [
            {
              title: '1.1 Agreement Title & Date',
              summary: 'Sets official title and date of execution.',
              content: '# MUTUAL NONDISCLOSURE AGREEMENT\n\nThis Mutual Nondisclosure Agreement ("Agreement") is entered into on this ____ day of ____________, 20__ ("Effective Date"), by and between the parties listed below.'
            },
            {
              title: '1.2 Definition of Parties',
              summary: 'Defines who is the Discloser and who is the Recipient.',
              content: '### Parties\n\n* **[Disclosing Party Name]**, a corporation organized and existing under the laws of [State/Country] ("Party A").\n* **[Receiving Party Name]**, a corporation organized and existing under the laws of [State/Country] ("Party B").'
            }
          ]
        },
        {
          title: '2. Confidential Information',
          summary: 'Defines what constitutes confidential information and sets the boundaries of protection.',
          subsections: [
            {
              title: '2.1 Definition of Protected Information',
              summary: 'Detailed explanation of assets, technical parameters, and code protected.',
              content: '### Clause 2.1: Protected Scope\n\n"Confidential Information" refers to any proprietary details, including but not limited to source code, algorithms, business plans, financial projections, customer datasets, and architectural models, marked as confidential or reasonably understood to be proprietary.'
            },
            {
              title: '2.2 Permitted Exclusions',
              summary: 'Outlines standard legal exclusions (e.g., publicly available data).',
              content: '### Clause 2.2: Standard Exclusions\n\nConfidential Information does not include information that: (a) is or becomes publicly known through no breach by Recipient; (b) was already known; or (c) is independently developed.'
            }
          ]
        },
        {
          title: '3. Terms & Jurisdictions',
          summary: 'Defines duration of confidentiality obligation, governing law, and dispute resolutions.',
          subsections: [
            {
              title: '3.1 Term of Obligation',
              summary: 'Sets the number of years the protection lasts.',
              content: '### Clause 3.1: Term of Agreement\n\nThe obligations of confidentiality under this Agreement shall survive for a period of **[e.g., 3 years / 5 years]** from the Effective Date of this Agreement.'
            },
            {
              title: '3.2 Governing Law',
              summary: 'Specifies the state/country jurisdiction.',
              content: '### Clause 3.2: Jurisdiction and Dispute Resolution\n\nThis Agreement shall be governed by, construed, and enforced in accordance with the laws of the State of **[State Name]**, without regard to conflict of law principles.'
            }
          ]
        }
      ]
    }
  ],
  [WORKSPACE_TYPES.TECHNICAL]: [
    {
      id: 'tech_spec_standard',
      name: 'Standard Software Design Specification',
      description: 'A robust template for detailing system architecture, API schemas, and deployment plans.',
      sections: [
        {
          title: '1. Executive Summary & Goals',
          summary: 'Introduction, scope, technical problem description, and defined constraints.',
          subsections: [
            {
              title: '1.1 System Objectives',
              summary: 'Why are we building this system? What core problems does it solve?',
              content: '# Software Design Specification: [System Name]\n\n## 1.1 Objectives & Problem Statement\n\nDescribe the business context and technical challenges that require this implementation. What are the key success metrics?'
            },
            {
              title: '1.2 System Scope & Out of Scope',
              summary: 'Boundaries of the project implementation.',
              content: '## 1.2 System Boundaries\n\n* **In Scope**: List the primary components, features, or APIs being developed.\n* **Out of Scope**: Explicitly document what is deliberately excluded from this development phase.'
            }
          ]
        },
        {
          title: '2. Architecture & Data Structures',
          summary: 'Detailed design of database tables, network protocols, component diagrams.',
          subsections: [
            {
              title: '2.1 High-Level Component Architecture',
              summary: 'Overview diagram representation description.',
              content: '## 2.1 Component Diagram & Flow\n\n```\n[Client Layer] --> (API Gateway) --> [Microservice A] --> (Database)\n                                --> [Microservice B] --> (Cache)\n```\n\nExplain the interaction between the frontend, backend gateways, worker nodes, and databases.'
            },
            {
              title: '2.2 API Endpoints and Schema',
              summary: 'JSON request/response models and interface routing details.',
              content: '## 2.2 REST / gRPC API Specifications\n\n### `POST /api/v1/resource`\n\n**Request Payload**:\n```json\n{\n  "id": "string",\n  "name": "string",\n  "configs": {}\n}\n```\n\n**Success Response (201 Created)**:\n```json\n{\n  "status": "success",\n  "data": {}\n}\n```'
            }
          ]
        },
        {
          title: '3. Reliability, Security & Scalability',
          summary: 'Details on authentication, failure recovery, caching, rate limiting, and compliance.',
          subsections: [
            {
              title: '3.1 Security & Compliance',
              summary: 'Details on JWT encryption, role-based access control, GDPR requirements.',
              content: '## 3.1 Security Specifications\n\n* **Encryption**: TLS 1.3 in-transit, AES-256 at-rest.\n* **Authentication**: OAuth 2.0 / JWT token authentication.\n* **Access Control**: Role-Based Access Control (RBAC) mapping policies.'
            }
          ]
        }
      ]
    }
  ],
  [WORKSPACE_TYPES.BUSINESS]: [
    {
      id: 'biz_market_report',
      name: 'Business Case & Market Analysis Report',
      description: 'Comprehensive structure to model business strategies, market opportunities, and financial roadmaps.',
      sections: [
        {
          title: '1. Executive Summary',
          summary: 'High-level synthesis of findings, business model, and strategic proposal.',
          subsections: [
            {
              title: '1.1 Project Objectives & Goals',
              summary: 'Defines why this report exists and the desired strategic actions.',
              content: '# Business Strategy Report: [Topic Name]\n\n## 1.1 Executive Overview\n\nSynthesize the key insights, objectives, and primary recommendations presented in this documentation...'
            }
          ]
        },
        {
          title: '2. Market Analysis & Position',
          summary: 'Details on target audiences, competitive landscapes, and SWOT assessments.',
          subsections: [
            {
              title: '2.1 Competitor Assessment',
              summary: 'Evaluates top industry leaders and market differentiation points.',
              content: '## 2.1 Competitor Landscape\n\n| Competitor | Market Share | Strengths | Weaknesses | Our Strategy |\n|---|---|---|---|---|\n| Competitor A | 35% | Brand equity | High cost | Cost-leadership |\n| Competitor B | 20% | Niche feature | Limited scale | Feature expansion |'
            },
            {
              title: '2.2 SWOT Analysis',
              summary: 'Strengths, Weaknesses, Opportunities, Threats.',
              content: '## 2.2 SWOT Analysis Matrix\n\n* **Strengths**: What distinct assets or core competencies do we possess?\n* **Weaknesses**: What parameters limit our execution or scalability?\n* **Opportunities**: Which market trends, demographic changes, or technology shifts can we capitalize on?\n* **Threats**: What external regulatory, economic, or competitive risks do we face?'
            }
          ]
        },
        {
          title: '3. Financial Strategy & Action Plan',
          summary: 'Required funding, ROI calculations, and milestone projection.',
          subsections: [
            {
              title: '3.1 Action Roadmap & KPIs',
              summary: 'Deliverables checklist, timelines, and measurable goals.',
              content: '## 3.1 Strategic Action Plan\n\n1. **Phase 1: Research & Discovery** (Months 1-2): Validate audience assumptions.\n2. **Phase 2: MVP Development** (Months 3-5): Launch target operations.\n3. **Phase 3: Scale & Optimize** (Months 6-12): Customer acquisition.'
            }
          ]
        }
      ]
    }
  ],
  [WORKSPACE_TYPES.RESEARCH]: [
    {
      id: 'academic_research_standard',
      name: 'Scientific / Academic Research Structure',
      description: 'Standard architecture following the scientific IMRaD method (Introduction, Methods, Results, Discussion).',
      sections: [
        {
          title: '1. Abstract & Introduction',
          summary: 'The scientific objective, paper abstract, governing theories, and literature background.',
          subsections: [
            {
              title: '1.1 Abstract',
              summary: 'High-level synthesis of findings, methodology, and scientific importance.',
              content: '# Research Paper: [Title of the Research]\n\n## Abstract\n\nProvide a concise summary of the research questions, methodologies applied, primary findings, and broader scientific significance (approx. 150-250 words)...'
            },
            {
              title: '1.2 Context & Literature Review',
              summary: 'Governing context, hypotheses, and citing relevant scientific research backgrounds.',
              content: '## 1.2 Introduction & Background\n\nState the research problem clearly, formulate the primary hypotheses, and discuss relevant historical literature or theories that justify this study...'
            }
          ]
        },
        {
          title: '2. Materials & Methodology',
          summary: 'Scientific datasets, experimental cohorts, physical equipment, and formulas applied.',
          subsections: [
            {
              title: '2.1 Experimental Procedures',
              summary: 'Chronological timeline of tests, cohort sizes, control factors.',
              content: '## 2.1 Experimental Setup & cohorts\n\nDetail the material specifications, selection criteria for study cohorts, software environments, and specific algorithms utilized so that the experiment is fully reproducible.'
            }
          ]
        },
        {
          title: '3. Results & Academic Discussion',
          summary: 'Data models, numerical outcomes, graphs, discussions of error margins, and summaries.',
          subsections: [
            {
              title: '3.1 Empirical Findings',
              summary: 'Tabulated outputs, margin of errors, statistical tests.',
              content: '## 3.1 Data Analysis & Findings\n\nPresent your collected scientific data using tables, equations, and concise descriptive summaries...'
            },
            {
              title: '3.2 Scientific Discussion & Limitations',
              summary: 'Interpreting outcomes, limitations of cohorts, future works.',
              content: '## 3.2 Discussion\n\nAnalyze whether the empirical outcomes validate or reject the initial hypotheses. Discuss any sources of error, limitations in cohort selection, and fields for future research.'
            }
          ]
        }
      ]
    }
  ]
}
