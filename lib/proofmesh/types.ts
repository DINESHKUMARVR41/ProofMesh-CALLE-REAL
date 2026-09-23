export type EvidenceKind = 'purchase_order' | 'purchase_order_amendment' | 'invoice' | 'delivery_note' | 'certificate' | 'company_profile' | 'other'
export type ClaimType = 'entity' | 'quantity' | 'price' | 'total' | 'date' | 'validity' | 'identifier' | 'text' | 'supplier_statement'
export type FindingSeverity = 'critical' | 'warning' | 'info'
export type FindingStatus = 'unresolved' | 'investigating' | 'resolved' | 'rejected'

export interface SourceDocument { id:string; name:string; mimeType:string; size:number; sha256:string; kind:EvidenceKind; createdAt:string; textPreview:string; pageCount?:number }
export interface Claim { id:string; sourceId:string; sourceName:string; type:ClaimType; subject:string; predicate:string; value:string|number; unit?:string; page?:number; confidence:number; extractedBy?:'gemini'|'rule'|'call' }
export interface GraphNode { id:string; label:string; type:string; sourceId?:string }
export interface GraphEdge { source:string; target:string; label:string }
export interface Finding { id:string; type:string; title:string; severity:FindingSeverity; status:FindingStatus; explanation:string; claimIds:string[]; missingEvidence:string[]; createdAt:string; resolution?:string; recommendedAction?:string }
export interface Investigation { id:string; findingId:string; phone:string; contactName:string; status:'draft'|'approved'|'queued'|'in_progress'|'completed'|'failed'; goal:string; callId?:string; supplierClaim?:string; requestedEvidence?:string[]; transcript?:{role:'agent'|'human';text:string;timestampSeconds:number}[]; createdAt:string }
export interface ProofCase { id:string; name:string; status:'ready'|'investigating'|'resolved'; createdAt:string; documents:SourceDocument[]; claims:Claim[]; nodes:GraphNode[]; edges:GraphEdge[]; findings:Finding[]; investigations:Investigation[]; summary:{totalClaims:number;findings:number;unresolved:number;verified:number} }
