/** UI-only contracts. Stock authority and immutable requests stay in the controller/client. */
export type StockRecord={id:string;[key:string]:unknown};
export type StockSection='balances'|'history'|'assessment';
export type StockPage<T>={pageItems:T[];page:number;pageCount:number;start:number;end:number;total:number;setPage:(page:number)=>void};
export type StockTotals={onHand:number;reserved:number;available:number;low:number};
export type StockWorkspaceViewProps={
 section:StockSection;
 onSectionChange:(next:StockSection)=>void;
 readOnly:boolean;
 onRecordMovement:()=>void;
 balances:{search:string;onSearch:(value:string)=>void;page:StockPage<StockRecord>;activeCount:number;totals:StockTotals;onRecord:(productId:string)=>void;onAssess:(productId:string)=>void};
 history:{filter:string;onFilter:(value:string)=>void;page:StockPage<StockRecord>;correctionLinks:StockRecord[];onCorrection:(movementId:string)=>void};
 assessment:{products:StockRecord[];selectedProductId:string;onSelect:(productId:string)=>void;onAssess:(productId:string)=>void;onExperiment:()=>void};
};
