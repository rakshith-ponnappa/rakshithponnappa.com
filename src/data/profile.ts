// Single source of truth for the résumé: pages, the PDF, JSON-LD, llms.txt and the AI corpus all read from here.

export const profile = {
  name: 'Rakshith S P',
  fullName: 'Rakshith Siragaje Ponnappa',
  headline: 'Principal Platform Engineer',
  tagline: 'Cloud platforms, SRE & AI agent infrastructure',
  pitch:
    'I build and run the platforms enterprises and AI teams depend on: landing zones, Kubernetes, Terraform and secure delivery pipelines across Azure, AWS and GCP, and the sandboxed environments where AI agents are trained and evaluated. The discipline is the same everywhere: infrastructure as code, guardrails, evals, observability and a tested way back. I lead technical delivery across enterprise programmes and set the engineering standards.',
  // Home hero only: follows the role line, so it carries scope and proof instead of repeating "I build the platforms…".
  heroPitch:
    'Landing zones, Kubernetes, Terraform and secure delivery pipelines on Azure, AWS and GCP for banks, retailers, telcos and government across the UK, US and GCC. For AI teams, the sandboxed desktops computer-use agents are trained and evaluated in, and the tests that keep them contained. I lead the technical delivery, set the engineering standards and keep the platforms reliable in production.',
  location: 'Bengaluru, India',
  careerStart: '2014-08-01',
  email: 'contact@rakshithponnappa.com',
  phone: '+91 90354 00153',
  phoneHref: 'tel:+919035400153',
  site: 'https://rakshithponnappa.com',
  github: 'https://github.com/rakshith-ponnappa',
  linkedin: 'https://www.linkedin.com/in/rakshith-siragaje-ponnappa-60809355/',
  resumePdf: '/Rakshith_SP_Resume.pdf',
  photo: 'rakshith-portrait.png' as string | null,
  openTo: 'Platform engineering leadership, SRE, AI infrastructure and forward-deployed engineering roles',
};

export const highlights = [
  { value: '12+', label: 'years in cloud & DevOps' },
  { value: '500+', label: 'VMs migrated to Azure with DR' },
  // Getter: `certifications` is declared further down this module.
  { get value() { return String(certifications.length); }, label: 'certifications' },
  { value: '4', label: 'clouds: Azure · AWS · GCP · Huawei' },
  { value: '4 yrs', label: 'on-ground in Dubai & Oman' },
  { value: '20+', label: 'enterprise clients across UK, US & GCC' },
];

export type Span = { label: string; detail?: string };
export type Role = {
  id: string;
  title: string;
  company: string;
  location: string;
  start: string; // YYYY-MM
  end: string | null; // null = present
  kind: 'full-time' | 'contract';
  summary: string;
  bullets: string[];
  clients: Span[];
};

export const experience: Role[] = [
  {
    id: 'ensono',
    title: 'Expert Technology Consultant – DevOps (Principal Consultant)',
    company: 'Ensono',
    location: 'Bengaluru · remote delivery to UK, US & GCC clients',
    start: '2022-12',
    end: null,
    kind: 'full-time',
    summary:
      'Senior technical lead across concurrent enterprise programmes: set the engineering standards for CI/CD, IaC, security scanning and release management, guide the engineers who deliver them and advise client leadership on architecture.',
    bullets: [
      'Designed reusable GitLab CI templates with OIDC multi-cloud authentication and MR-gated SAST, DAST and secret detection, adopted across engagements.',
      'State Street (PFI): lead architect, end to end, for an NTT data-centre exit to Azure; built the Terraform module library from scratch (VM, SQL MI, Oracle, load balancer, Front Door, Key Vault/DES, ASR, RSV), provisioned 500+ VMs configured for DR, and ran 3 production cutovers that put 10+ applications live.',
      'State Street (PFI): cross-region DR on Azure Site Recovery (private-endpoint CMK vault, batch recovery plans, SQL MI geo-failover, RPO target under 15 min); split 35,000 Terraform resources into per-app TFE workspaces and Harness pipelines with zero reboots; built a golden-image VM factory that cut VM builds from 30 to 2–3 minutes.',
      'Five Below: Azure landing zone audit (WAF 8.0 static / 6.6 runtime, CIS); remediation roadmap cut critical findings by 75%; $47K annual savings identified.',
      'Mott MacDonald: ALZ QA build-out, Terraform connectivity fixes, GitHub Actions architecture; ADO → Harness migration feasibility with a 5-week phased plan.',
    ],
    clients: [
      { label: 'State Street', detail: 'DC exit · 500+ VMs · DR · TFE split' },
      { label: 'Five Below', detail: 'LZ audit' },
      { label: 'Mott MacDonald', detail: 'ALZ QA' },
      { label: 'Kingfisher', detail: 'Policy-as-code' },
      { label: 'Menzies', detail: 'Multi-account LZ' },
      { label: 'EZCorp', detail: 'Databricks / network' },
    ],
  },
  {
    id: 'gitlab',
    title: 'Professional Services Engineer',
    company: 'GitLab',
    location: 'Remote · contract · customer: Crédit du Maroc (banking, Morocco)',
    start: '2026-10',
    end: null,
    kind: 'contract',
    summary:
      'With GitLab Professional Services (contract), one of two engineers upgrading Crédit du Maroc’s self-managed GitLab from 12.x towards 19.x, one required stop at a time, on the bank’s live CI/CD estate.',
    bullets: [
      'Execute the multi-hop upgrade path (27 hops in phase 1), each hop rehearsed on a copy of live data and promoted only on evidence, with the untouched copy as the rollback.',
      'Run maintenance windows end to end: runner traffic blocked at the proxy, background migrations drained, PostgreSQL upgrades at major versions, validation scripts before and after, then a test pipeline and a written report per hop.',
      'Turned the method into a public, field-tested runbook: gitlab-omnibus-upgrade-playbook.',
    ],
    clients: [{ label: 'Crédit du Maroc', detail: 'GitLab upgrade' }],
  },
  {
    id: 'turing',
    title: 'DevOps Engineer, AI Agent Training Platform',
    company: 'Turing',
    location: 'Remote · contract',
    start: '2026-09',
    end: '2026-11',
    kind: 'contract',
    summary:
      'Built and ran the sandboxed desktop environments where computer-use AI agents are trained and evaluated, on an agent training and benchmark platform for a frontier AI lab.',
    bullets: [
      'Built the sandboxed Linux desktop image (GNOME, arm64) that computer-use agents operate in, and ported the agent evaluation harness to a new managed sandbox provider.',
      'Ran the sandbox-provider migration analysis and proof of concept, and black-box conformance and security testing of the sandboxes: network egress policy, cloud-metadata probes, quota limits, snapshots, PTY/SSH/Git and secrets, with captured evidence and retests of vendor fixes.',
      'Platform DevOps on GCP Cloud Run with Jenkins and GitHub Actions: stood up the develop branch and staging environment, and designed the dev environment (design note plus Terraform for bootstrap, dev and prod).',
      'Agentic-coding training data: refined Codeforces-style tasks, validated brute-force and optimal reference solutions, wrote reasoning traces and built Docker test suites.',
    ],
    clients: [{ label: 'Agent sandboxes', detail: 'computer-use' }, { label: 'Platform DevOps', detail: 'Cloud Run' }, { label: 'Agentic coding data' }],
  },
  {
    id: 'planhub',
    title: 'Site Reliability & Platform Engineer (Freelance)',
    company: 'PlanHub',
    location: 'Remote · US construction-tech SaaS',
    start: '2023-06',
    end: '2025-07',
    kind: 'contract',
    summary:
      'Freelance SRE and platform engineer for PlanHub, the US preconstruction marketplace that connects general contractors, subcontractors and suppliers: ran the AWS developer platform and kept production reliable.',
    bullets: [
      'Owned the AWS platform in Terraform: VPC, RDS PostgreSQL with read replicas, ALB, NAT, Route 53 and ACM, with containerised services on ECS Fargate, ECR and CloudWatch logging.',
      'Ran the developer platform: QA/UAT/Prod CI/CD on CodePipeline, CodeBuild and CodeDeploy with GitHub and Slack, and Boto3 blue/green cut-overs for zero-downtime releases across 5 service tiers.',
      'Automated routine operations: 7 EventBridge-scheduled Lambda jobs for archival, cleanup and push notifications.',
      'Security and compliance: HIPAA- and GDPR-aligned encryption, IAM and data-handling controls; 39 SSH keys moved into 1Password; ClamAV scanning across the estate.',
      'Data platform: Fivetran → Redshift behind a bastion host, with private QuickSight access over the VPC.',
    ],
    clients: [{ label: 'PlanHub', detail: 'AWS platform & SRE' }],
  },
  {
    id: 'ozone',
    title: 'Site Reliability Engineer',
    company: 'Ozone (Huco FZCO)',
    location: 'On-ground in Dubai, UAE (3 yrs) & Oman (1 yr)',
    start: '2019-09',
    end: '2022-12',
    kind: 'full-time',
    summary:
      'GCC on-site delivery for DU Telecom, Etisalat, RAK Bank, Dubai Municipality and Petroleum Development Oman.',
    bullets: [
      'Built self-hosted GitLab on Kubernetes with security-integrated pipelines for RAK Bank and DU Telecom.',
      'Deployed GKE, EKS and AKS with network policies and Cloud NAT; built Tanzu (TKGS) on vSphere 7 for a Blockchain-as-a-Service platform.',
      'Ran Istio, Harbor, Fluentd, Jaeger and Kasten in production.',
      'Real-time pipelines on AWS Kinesis and Confluent Kafka; multi-cloud network security with Private Link, VPC peering and IAM.',
    ],
    clients: [
      { label: 'DU Telecom' },
      { label: 'Etisalat' },
      { label: 'RAK Bank' },
      { label: 'Dubai Municipality' },
      { label: 'PDO', detail: 'Oman' },
    ],
  },
  {
    id: 'intuitive',
    title: 'DevOps Engineer',
    company: 'Intuitive Technology Partners',
    location: 'Bengaluru',
    start: '2018-05',
    end: '2019-09',
    kind: 'full-time',
    summary: 'Platform engineering on AWS EKS.',
    bullets: [
      'Architected an AWS EKS platform prototype to onboard 20 clients and migrate 30,000 websites, including capacity planning and cost control.',
      'Deployed SignalFx real-time EKS monitoring with custom dashboards and proactive alerting.',
    ],
    clients: [{ label: '30,000-site EKS migration' }],
  },
  {
    id: 'capgemini',
    title: 'Associate Consultant',
    company: 'Capgemini',
    location: 'Bengaluru · UK & Europe delivery',
    start: '2014-08',
    end: '2018-05',
    kind: 'full-time',
    summary: 'Cloud migration, architecture and CI/CD for UK and European enterprises.',
    bullets: [
      'Cloud transition, architecture and CI/CD delivery for Carnival, Grant Thornton, Esure, Heathrow Airport, Anglian Water, Ikano and Eneco.',
    ],
    clients: [
      { label: 'Carnival' },
      { label: 'Heathrow' },
      { label: 'Grant Thornton' },
      { label: 'Esure' },
      { label: 'Anglian Water' },
      { label: 'Ikano' },
      { label: 'Eneco' },
    ],
  },
];

export type Cert = {
  name: string;
  issuer: 'AWS' | 'Microsoft' | 'Google Cloud' | 'CNCF' | 'HashiCorp' | 'VMware' | 'Red Hat' | 'Palo Alto' | 'AXELOS';
  code?: string;
  group: 'AI' | 'Cloud' | 'Platform' | 'Specialty';
  featured?: boolean;
};

export const certifications: Cert[] = [
  { name: 'Agentic AI Business Solutions Architect', code: 'AB-100', issuer: 'Microsoft', group: 'AI', featured: true },
  { name: 'AI Practitioner', issuer: 'AWS', group: 'AI' },
  { name: 'Azure AI Fundamentals', issuer: 'Microsoft', group: 'AI' },
  { name: 'Solutions Architect – Professional', issuer: 'AWS', group: 'Cloud', featured: true },
  { name: 'DevOps Engineer – Professional', issuer: 'AWS', group: 'Cloud', featured: true },
  { name: 'Solutions Architect – Associate', issuer: 'AWS', group: 'Cloud' },
  { name: 'DevOps Engineer Expert', code: 'AZ-400', issuer: 'Microsoft', group: 'Cloud', featured: true },
  { name: 'Azure Administrator', code: 'AZ-104', issuer: 'Microsoft', group: 'Cloud' },
  { name: 'Azure Security Engineer', issuer: 'Microsoft', group: 'Cloud' },
  { name: 'Azure Developer Associate', issuer: 'Microsoft', group: 'Cloud' },
  { name: 'MCSA: Cloud Platform', issuer: 'Microsoft', group: 'Cloud' },
  { name: 'Associate Cloud Engineer', issuer: 'Google Cloud', group: 'Cloud' },
  { name: 'Certified Kubernetes Administrator', code: 'CKA', issuer: 'CNCF', group: 'Platform', featured: true },
  { name: 'Terraform Associate', issuer: 'HashiCorp', group: 'Platform' },
  { name: 'Cloud-Native Master Specialist', issuer: 'VMware', group: 'Specialty' },
  { name: 'Container Platform', issuer: 'Red Hat', group: 'Specialty' },
  { name: 'Prisma Cloud Associate', issuer: 'Palo Alto', group: 'Specialty' },
  { name: 'ITIL Foundation', issuer: 'AXELOS', group: 'Specialty' },
];

export const education = [
  { degree: 'Master of Computer Applications', school: 'Bharathidasan University', year: '2016 – 2018' },
  { degree: 'Bachelor of Computer Applications', school: 'CMR Institute of Management Studies', year: '2011 – 2014' },
];

// Additional coursework (not degrees).
export const courses = [{ name: 'IoT, Cloud & Blockchain', provider: 'IIT Madras', year: '2024' }];

export const skills: { area: string; items: string[] }[] = [
  { area: 'Cloud', items: ['Azure', 'AWS', 'GCP (incl. Cloud Run)', 'Huawei Cloud (G42)', 'VMware Tanzu', 'OpenShift'] },
  { area: 'Infrastructure as code', items: ['Terraform / TFE', 'CloudFormation', 'Ansible / Tower', 'Packer', 'Helm'] },
  { area: 'Kubernetes & cloud native', items: ['AKS', 'EKS', 'GKE', 'TKGS', 'Rancher', 'K3s', 'Istio', 'Linkerd', 'Envoy', 'Harbor', 'Kasten'] },
  { area: 'CI/CD & GitOps', items: ['GitHub Actions', 'GitLab CI', 'Jenkins', 'Azure Pipelines', 'AWS CodePipeline', 'Harness', 'Tekton'] },
  { area: 'DevSecOps', items: ['Checkov', 'Prisma Cloud', 'AquaSec', 'Snyk', 'SonarQube', 'SAST/DAST', 'Vault', 'OIDC'] },
  { area: 'Observability', items: ['Prometheus', 'Dynatrace', 'New Relic', 'ELK/EFK', 'Jaeger', 'CloudWatch', 'Azure Monitor', 'PagerDuty'] },
  { area: 'AI', items: ['LLM evaluation', 'Multi-agent systems', 'RAG & retrieval evals', 'MCP / A2A', 'Azure AI Foundry', 'Copilot Studio', 'Ollama'] },
  { area: 'Data', items: ['Databricks', 'Redshift', 'Fivetran', 'Kafka', 'Kinesis', 'OpenSearch'] },
  { area: 'Code', items: ['Python (Boto3, FastAPI)', 'Bash', 'HCL', 'TypeScript', 'YAML'] },
];

export const fieldDeployments = [
  { city: 'Dubai', country: 'UAE', years: '3 yrs on-ground', clients: 'DU · Etisalat · RAK Bank · Dubai Municipality' },
  { city: 'Muscat', country: 'Oman', years: '1 yr on-ground', clients: 'Petroleum Development Oman' },
  { city: 'Bengaluru', country: 'India', years: 'Home base', clients: 'Remote delivery to UK, US & GCC' },
];

export function uptime(since = profile.careerStart, now = new Date()) {
  const s = new Date(since + 'T00:00:00Z');
  let months = (now.getUTCFullYear() - s.getUTCFullYear()) * 12 + (now.getUTCMonth() - s.getUTCMonth());
  if (now.getUTCDate() < s.getUTCDate()) months -= 1;
  return { years: Math.floor(months / 12), months: months % 12 };
}

export function fmtMonth(ym: string | null) {
  if (!ym) return 'Present';
  const [y, m] = ym.split('-').map(Number);
  return `${'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ')[m - 1]} ${y}`;
}
