export type OntologyEntryType = "Concept" | "Mechanism" | "System" | "Stakeholder" | "BusinessImpact";

export type OntologyEntry = {
  type: OntologyEntryType;
  label: string;
  aliases: string[];
  extractionPhrases: string[];
  description: string;
  implementsConcepts?: string[];
  usedBySystems?: string[];
  affectsSystems?: string[];
  enablesImpacts?: string[];
  createsRisks?: string[];
  stakeholders?: string[];
};

export type OntologyRelationshipPattern = {
  sourceType: OntologyEntryType | "Proposal" | "Topic";
  edgeType: string;
  targetType: OntologyEntryType | "Proposal" | "Topic";
  ruleFamily: "direct_metadata" | "ontology_extraction" | "operational_inference";
};

export const ONTOLOGY_VERSION = "phase13-ontology-1";

export const GENERIC_TERM_STOPLIST = [
  "standard",
  "proposal",
  "interface",
  "contract",
  "system",
  "mechanism",
  "feature",
  "data",
  "process",
  "ethereum",
];

export const ONTOLOGY: OntologyEntry[] = [
  concept("Account Abstraction", ["aa", "erc-4337", "smart account abstraction"], ["account abstraction", "erc-4337", "smart account"], ["Smart Account", "Wallet"], ["Wallet Integration Requirement", "Transaction Friction Reduction"]),
  concept("Delegated Authorization", ["authorization delegation", "delegated account permission", "delegation authorization"], ["delegated authorization", "delegated account permission", "set eoa account code", "authorization delegation", "scoped permission"], ["Wallet"], ["Wallet Integration Requirement", "Security Model Change"]),
  concept("Wallet Authorization", ["wallet permission", "wallet permissions"], ["wallet authorization", "wallet permission", "account authorization"], ["Wallet"], ["Wallet Integration Requirement"]),
  concept("Gas Sponsorship", ["sponsored transaction", "fee sponsor"], ["gas sponsorship", "sponsored transaction", "fee sponsor", "paymaster"], ["Wallet", "Smart Account"], ["Gas Payment Flexibility", "Transaction Friction Reduction"]),
  concept("Transaction Cost Abstraction", ["fee abstraction"], ["transaction cost abstraction", "gas abstraction", "fee abstraction"], ["Wallet", "Smart Account"], ["Transaction Friction Reduction", "Gas Payment Flexibility"]),
  concept("Partial Statefulness", ["partial state", "state witness"], ["partial statefulness", "state witness", "statelessness"], ["Execution Client"], ["Client Implementation Requirement"]),
  concept("Block Access", ["block access lists"], ["block access", "block access list", "block-level access list"], ["Execution Client"], ["Client Implementation Requirement"]),
  concept("Gas Accounting", ["resource accounting"], ["gas accounting", "resource accounting", "gas cost", "gas repricing"], ["Execution Client"], ["Client Implementation Requirement"]),
  concept("Tokenized Vault", ["tokenized vault requests"], ["tokenized vault", "erc-4626", "vault request", "redemption request"], ["Vault", "Token Contract"], ["Settlement Automation", "Custody Policy Review"]),
  concept("Vault Request", ["vault requests", "redemption request"], ["vault request", "transferable request", "redemption request"], ["Vault", "Settlement System"], ["Settlement Automation"]),
  concept("Compliance Logging", ["compliance event logging"], ["compliance logging", "compliance event", "subject-linked event", "restricted transfer"], ["Compliance Engine", "Token Contract"], ["Compliance Auditability", "Monitoring Requirement"]),
  concept("Asset Attestation", ["asset anchor", "asset registry"], ["asset attestation", "asset anchor", "asset registry", "proof of reserve"], ["Oracle", "Custody System"], ["Asset Verification Capability", "Monitoring Requirement"]),
  concept("NAV Reporting", ["nav snapshot", "net asset value"], ["nav reporting", "nav snapshot", "net asset value", "valuation snapshot"], ["Oracle", "Vault"], ["Asset Verification Capability", "Monitoring Requirement"]),
  concept("Post-Quantum Authentication", ["post quantum authentication", "pq authentication"], ["post-quantum", "post quantum", "validator authentication", "quantum-resistant"], ["Consensus Client", "Validator"], ["Security Model Change", "Validator Operational Change"]),
  concept("Signature Aggregation", ["aggregated signature"], ["signature aggregation", "aggregated signature", "signature aggregator"], ["Wallet", "Consensus Client"], ["Security Model Change"]),
  concept("Privacy-Preserving Transfer", ["private transfer", "confidential transfer"], ["privacy-preserving transfer", "private transfer", "confidential transfer"], ["Token Contract"], ["Increased Technical Complexity", "Monitoring Requirement"]),
  concept("Contract State Representation", ["state representation"], ["contract state representation", "state commitment", "state tree", "binary tree", "unified binary tree"], ["Execution Client"], ["Client Implementation Requirement"]),
  concept("Modular Contract Architecture", ["modular account", "modular proxy"], ["modular contract", "modular account", "modular proxy", "account module"], ["Smart Account", "Token Contract"], ["Increased Technical Complexity"]),

  mechanism("UserOperation", ["user operation"], ["useroperation", "user operation"], ["Account Abstraction"], ["Smart Account", "Wallet"]),
  mechanism("Bundler", [], ["bundler"], ["Account Abstraction"], ["Smart Account"]),
  mechanism("Paymaster", [], ["paymaster"], ["Gas Sponsorship", "Transaction Cost Abstraction"], ["Smart Account", "Wallet"]),
  mechanism("Session Key", ["session keys"], ["session key", "session keys"], ["Delegated Authorization", "Wallet Authorization"], ["Wallet", "Smart Account"]),
  mechanism("Delegation", [], ["delegation", "delegate", "delegated"], ["Delegated Authorization"], ["Wallet", "Smart Account"]),
  mechanism("Access List", [], ["access list"], ["Block Access"], ["Execution Client"]),
  mechanism("Block-Level Access List", ["block access list"], ["block-level access list", "block access list"], ["Block Access", "Partial Statefulness"], ["Execution Client"]),
  mechanism("Transferable Request", [], ["transferable request"], ["Vault Request"], ["Vault", "Settlement System"]),
  mechanism("Subject-Linked Event Log", ["subject-linked log"], ["subject-linked event log", "subject-linked log", "subject linked"], ["Compliance Logging"], ["Compliance Engine", "Indexer"]),
  mechanism("Snapshot Oracle", [], ["snapshot oracle", "nav snapshot", "valuation snapshot"], ["NAV Reporting", "Asset Attestation"], ["Oracle"]),
  mechanism("Attestation Aggregator", [], ["attestation aggregator", "attestation aggregate"], ["Asset Attestation", "Post-Quantum Authentication"], ["Oracle", "Consensus Client"]),
  mechanism("Transfer Hook", [], ["transfer hook", "restricted transfer"], ["Compliance Logging", "Privacy-Preserving Transfer"], ["Token Contract", "Compliance Engine"]),
  mechanism("Signature Validation", [], ["signature validation", "validate signature", "signature"], ["Post-Quantum Authentication", "Signature Aggregation", "Wallet Authorization"], ["Wallet", "Consensus Client"]),
  mechanism("Deterministic Factory", [], ["deterministic factory", "create2 factory"], ["Modular Contract Architecture"], ["Smart Account", "Token Contract"]),
  mechanism("Modular Proxy", [], ["modular proxy", "proxy module"], ["Modular Contract Architecture"], ["Smart Account", "Token Contract"]),
  mechanism("State Commitment", [], ["state commitment", "state root", "state witness"], ["Contract State Representation", "Partial Statefulness"], ["Execution Client"]),

  system("Wallet", ["wallets"], ["wallet"], ["Wallet Provider", "End User", "Dapp Developer"]),
  system("Smart Account", ["smart wallet"], ["smart account", "contract account"], ["Wallet Provider", "Dapp Developer", "End User"]),
  system("Execution Client", ["evm client"], ["execution client", "evm", "execution layer"], ["Client Maintainer", "Protocol Developer", "Validator Operator"]),
  system("Consensus Client", ["beacon client"], ["consensus client", "beacon"], ["Client Maintainer", "Validator Operator", "Protocol Developer"]),
  system("Validator", ["validator operations"], ["validator", "staking"], ["Validator Operator"]),
  system("Vault", ["tokenized vault"], ["vault", "erc-4626"], ["Asset Issuer", "Custodian", "Exchange"]),
  system("Oracle", ["price oracle"], ["oracle", "price feed", "valuation"], ["Oracle Provider", "Asset Issuer"]),
  system("Token Contract", ["token"], ["token contract", "erc-20", "erc-721", "erc-1155"], ["Dapp Developer", "Asset Issuer", "Exchange"]),
  system("Custody System", ["custody"], ["custody", "custodian"], ["Custodian", "Compliance Team"]),
  system("Settlement System", ["settlement"], ["settlement", "redemption"], ["Exchange", "Custodian", "Asset Issuer"]),
  system("Compliance Engine", ["compliance"], ["compliance engine", "allowlist", "kyc", "restricted transfer"], ["Compliance Team", "Asset Issuer", "Exchange"]),
  system("Indexer", ["indexing"], ["indexer", "indexing"], ["Dapp Developer", "Compliance Team"]),

  stakeholder("Wallet Provider"),
  stakeholder("Dapp Developer"),
  stakeholder("Protocol Developer"),
  stakeholder("Client Maintainer"),
  stakeholder("Validator Operator"),
  stakeholder("Asset Issuer"),
  stakeholder("Custodian"),
  stakeholder("Exchange"),
  stakeholder("Oracle Provider"),
  stakeholder("Compliance Team"),
  stakeholder("End User"),

  impact("Wallet Integration Requirement", ["New Wallet Integration Requirement"]),
  impact("Transaction Friction Reduction", ["Reduced Transaction Friction"]),
  impact("Gas Payment Flexibility"),
  impact("Client Implementation Requirement"),
  impact("Validator Operational Change"),
  impact("Compliance Auditability"),
  impact("Asset Verification Capability"),
  impact("Settlement Automation"),
  impact("Custody Policy Review", ["Custody Policy Change"]),
  impact("Increased Technical Complexity", ["Increased Implementation Complexity"]),
  impact("Security Model Change"),
  impact("Monitoring Requirement"),
  impact("No Current Direct Dependency", ["No Current KGLD Dependency"]),
];

export const PERMITTED_RELATIONSHIP_PATTERNS: OntologyRelationshipPattern[] = [
  { sourceType: "Proposal", edgeType: "BELONGS_TO_TOPIC", targetType: "Topic", ruleFamily: "direct_metadata" },
  { sourceType: "Proposal", edgeType: "DESCRIBES", targetType: "Concept", ruleFamily: "ontology_extraction" },
  { sourceType: "Proposal", edgeType: "INTRODUCES", targetType: "Mechanism", ruleFamily: "ontology_extraction" },
  { sourceType: "Mechanism", edgeType: "IMPLEMENTS", targetType: "Concept", ruleFamily: "ontology_extraction" },
  { sourceType: "Mechanism", edgeType: "USED_BY", targetType: "System", ruleFamily: "ontology_extraction" },
  { sourceType: "Concept", edgeType: "AFFECTS", targetType: "System", ruleFamily: "ontology_extraction" },
  { sourceType: "System", edgeType: "RELEVANT_TO", targetType: "Stakeholder", ruleFamily: "operational_inference" },
  { sourceType: "Concept", edgeType: "ENABLES", targetType: "BusinessImpact", ruleFamily: "operational_inference" },
  { sourceType: "Concept", edgeType: "CREATES_RISK", targetType: "BusinessImpact", ruleFamily: "operational_inference" },
  { sourceType: "BusinessImpact", edgeType: "RELEVANT_TO", targetType: "Stakeholder", ruleFamily: "operational_inference" },
  { sourceType: "Proposal", edgeType: "EXTENDS", targetType: "Proposal", ruleFamily: "direct_metadata" },
  { sourceType: "Proposal", edgeType: "REQUIRES", targetType: "Proposal", ruleFamily: "direct_metadata" },
  { sourceType: "Proposal", edgeType: "DEPENDS_ON", targetType: "Proposal", ruleFamily: "direct_metadata" },
  { sourceType: "Proposal", edgeType: "SUPERSEDES", targetType: "Proposal", ruleFamily: "direct_metadata" },
  { sourceType: "Proposal", edgeType: "CONFLICTS_WITH", targetType: "Proposal", ruleFamily: "direct_metadata" },
];

export const INVALID_RELATIONSHIP_PATTERNS = [
  "dependency edge from semantic similarity only",
  "business impact implying adoption without adoption evidence",
  "KGLD dependency from broad topic membership only",
];

function concept(label: string, aliases: string[] = [], phrases: string[] = [], affectsSystems: string[] = [], enablesImpacts: string[] = []): OntologyEntry {
  return { type: "Concept", label, aliases, extractionPhrases: phrases, description: `${label} concept.`, affectsSystems, enablesImpacts };
}

function mechanism(label: string, aliases: string[] = [], phrases: string[] = [], implementsConcepts: string[] = [], usedBySystems: string[] = []): OntologyEntry {
  return { type: "Mechanism", label, aliases, extractionPhrases: phrases, description: `${label} mechanism.`, implementsConcepts, usedBySystems };
}

function system(label: string, aliases: string[] = [], phrases: string[] = [], stakeholders: string[] = []): OntologyEntry {
  return { type: "System", label, aliases, extractionPhrases: phrases, description: `${label} system.`, stakeholders };
}

function stakeholder(label: string, aliases: string[] = []): OntologyEntry {
  return { type: "Stakeholder", label, aliases, extractionPhrases: [label], description: `${label} stakeholder.` };
}

function impact(label: string, aliases: string[] = []): OntologyEntry {
  return { type: "BusinessImpact", label, aliases, extractionPhrases: [label], description: `${label} impact.` };
}
