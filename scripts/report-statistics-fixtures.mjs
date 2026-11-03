export const dayFilters={dateFrom:'2026-10-24',dateTo:'2026-10-30'};
export const observed=Date.parse('2026-10-30T04:00:00Z');
export function selection(rows,dated=false){return {rows,cursor:null,hasMore:false,scanned:rows.length,observedAtMs:observed,coverage:{scope:'filtered',complete:true,scanned:rows.length,scanCap:2000,readCount:rows.length+3,readCap:10000,undatedExcluded:dated,dateBasis:'Recorded date; Malaysia UTC+08:00',unknownValues:false,assignedOnly:false}};}
export function stockRows(){return [
 {id:'zero-reserved',sku:'SKU-1',name:'Demo item',status:'Active',archived:false,quantityOnHand:10,reservedQuantity:0,warehouseReservedQuantity:0,reorderLevel:2},
 {id:'reorder',sku:'SKU-2',name:'Low item',status:'Active',quantityOnHand:3,reservedQuantity:1,warehouseReservedQuantity:1,reorderLevel:2},
 {id:'missing',sku:'SKU-3',status:'Active',quantityOnHand:5,reorderLevel:1},
 {id:'archive',status:'Active',archived:true,quantityOnHand:10,reservedQuantity:0,reorderLevel:1},
 {id:'inactive',status:'Inactive',quantityOnHand:10,reservedQuantity:0,reorderLevel:1},
];}
