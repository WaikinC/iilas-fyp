import type {ReportPage,ReportCoverage} from './reporting';
export function validateReportPage(value:unknown,resource:string):ReportPage;
export function validateReportExport(value:unknown,resource:string,mode:'page'|'filtered'):{fileName:string;csv:string;rowCount:number;coverage:ReportCoverage;observedAtMs:number};
export function validateReportCoverage(value:unknown):import('./reporting').ReportCoverage;
