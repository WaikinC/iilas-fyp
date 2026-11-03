export type AppModule='dashboard'|'products'|'stock'|'warehouse'|'procurement'|'shipments'|'fleet'|'transport'|'delivery'|'reports'|'team'|'customer';
export type AppRoute={module:AppModule|'root'|'not-found';recordId:string|null;path:string};
export const APP_MODULE_PATHS:Readonly<Record<AppModule,string>>;
export function appRoutePath(module:AppModule,recordId?:string|null):string;
export function parseAppRoute(pathname:string):AppRoute;
export function appRouteAccess(route:AppRoute,role:string):{state:'allow'|'forbidden'|'not-found'}|{state:'redirect';path:string};
