import {randomUUID} from 'node:crypto';
import {demoRiskGraph} from './inventory-demo-reorder.mjs';
import {INVENTORY_CONTEXT_PROVENANCE} from '../../lib/inventoryContextAI.js';
export function acceptedGraph(){const g=demoRiskGraph(),review={operationId:randomUUID(),eventId:randomUUID(),decision:'Accept',notes:'Independent demo review accepted.',reviewedBy:'manager',reviewedAt:{seconds:2,nanoseconds:1}};g.requirement={...g.requirement,status:'Accepted',version:2,review};g.event={ownerId:'scope',requirementId:g.id,experimentId:g.id,operationId:review.operationId,actor:review.reviewedBy,decision:'Accept',notes:review.notes,fromVersion:1,toVersion:2,at:review.reviewedAt,version:1,...INVENTORY_CONTEXT_PROVENANCE};return g;}
