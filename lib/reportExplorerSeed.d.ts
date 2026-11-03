import type {ReportFilters} from './reporting';
export function consumeReportSeed(resource:string,seed:{revision:number;filters:ReportFilters},seenRevision:number|null):{revision:number;filters:ReportFilters}|null;
