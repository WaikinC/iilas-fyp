import type {StatisticsDistribution} from '../../../../lib/reportStatistics';
export const STATISTICS_COLOURS={green:'#166534',amber:'#854d0e',red:'#991b1b',blue:'#1d4ed8',grey:'#64748b'} as const;
export type StatisticsTone=keyof typeof STATISTICS_COLOURS;
const own=(map:Record<string,StatisticsTone>,value:string):StatisticsTone=>Object.hasOwn(map,value)?map[value]:'grey';
export function statisticsTone(resource:string,dimension:string,value:string):StatisticsTone{
 if(resource==='products'&&dimension==='condition')return own(({healthy:'green',reorder:'amber',unknown:'grey'} as Record<string,StatisticsTone>),value);
 if(dimension==='label'&&['inventoryAIExperiments','deliveryAIExperiments','predictions'].includes(resource))return own(({Normal:'green',Low:'green','Reorder Risk':'amber',Medium:'amber','Critical Stock Risk':'red',High:'red',Damaged:'red'} as Record<string,StatisticsTone>),value);
 if(dimension==='outcome'&&resource==='integrityChecks')return own(({Verified:'green',Mismatch:'red',Unavailable:'grey',Unregistered:'amber'} as Record<string,StatisticsTone>),value);
 if(['status','reviewState','reviewStatus','level'].includes(dimension))return own(({Delivered:'green',Approved:'green',Received:'green',Completed:'green',Available:'green',HandedOver:'green',Acknowledged:'green',Pending:'amber',Submitted:'amber',Prepared:'amber',Packed:'amber',PartReceived:'amber',Maintenance:'amber',NeedsFollowUp:'amber',Medium:'amber',High:'red',Failed:'red',Rejected:'red',Dispatched:'blue',Scheduled:'blue',Assigned:'blue',Picking:'blue',Issued:'blue',Expected:'blue',Running:'blue',Predicted:'blue','In Transit':'blue','Out for Delivery':'blue',Low:'green'} as Record<string,StatisticsTone>),value);
 return 'grey';
}
export function chooseStatisticsChart(d:StatisticsDistribution):'columns'|'donut'{return d.denominator>0&&d.values.length>0&&d.values.length<=5&&d.values.every(v=>v.count/d.denominator>=.05)&&!d.values.every(v=>['unknown','Unknown'].includes(v.key))?'donut':'columns';}
export function chooseStatisticsTimeChart(buckets:number):'bars'|'line'{return buckets>=4?'line':'bars';}
export function formatStatisticsValue(value:number|null){return value===null?'Unavailable':new Intl.NumberFormat('en-MY',{maximumFractionDigits:2}).format(value);}
export function statisticsTime(ms:number){return new Date(ms).toLocaleString('en-MY',{timeZone:'Asia/Kuala_Lumpur'});}
export function statisticsLabelLines(value:string):string[]{const words=value.split(' ');let i=1;while(i<words.length&&words.slice(0,i+1).join(' ').length<=14)i++;return [words.slice(0,i).join(' '),words.slice(i).join(' ')].filter(Boolean).map(s=>s.length>15?s.slice(0,14)+'…':s);}
export function categoryChartMinWidth(categories:number){return categories?categories*100+64:0;}
