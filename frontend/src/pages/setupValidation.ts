// The order snapshot preserves the SetUp version assigned to this lot.
const ranges:Record<string,[string,string]>={
 Kg_m:['Resin1_des','Resin1_nom'],Kgm_2:['Resin2_des','Resin2_nom'],
 Catalizador:['Cata1_des','Cata1_nom'],Catalizador_2:['Cata2_des','Cata2_nom'],
 Chop:['Chop1_des','Chop1_nom'],Chop_2:['Chop2_des','Chop2_nom'],
 Kgm_3:['Arena_des','Arena_nom'],velocidad:['VelProd_des','VelProd_nom'],
 Tiempo_Gel:['GelTimeL_min1','GelTimeL_max'],Tiempo_Gel_2:['GelTimeE_min1','GelTimeE_max'],
 Temp_DayT:['Temp_Day_Tank_min','Temp_Day_Tank_max'],Temp_DayT_2:['Temp_Day_Tank_min','Temp_Day_Tank_max'],
 Posicion:['PuntoCura_min','PuntoCura_max'],Temp_2:['PicoExot_min','PicoExot_max'],
 Temp_Fleje:['Temp_Fleje_min','Temp_Fleje_max'],Temp_Amb:['Temp_Ambient_min','Temp_Ambient_max'],
 SetPoint:['Induct_Set_Point_min','Induct_Set_Point_max'],Proceso:['Induct_Proceso_min','Induct_Proceso_max']
};
export function setupParameters(snapshot:Record<string,unknown> = {}):Record<string,unknown>{
 const raw=snapshot.parametros;
 try{const parsed=typeof raw==='string'?JSON.parse(raw):raw;return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{};}catch{return {};}
}
const number=(v:unknown)=>v===null||v===undefined||typeof v==='boolean'||String(v).trim()===''?null:Number.isFinite(Number(v))?Number(v):null;
export function validateProcess(key:string,value:string,setup:Record<string,unknown>){
 const pair=ranges[key];
 const min=pair?number(setup[pair[0]]):null,max=pair?number(setup[pair[1]]):null;
 if(min===null||max===null)return {state:'neutral',message:'Sin límites definidos en el SetUp'};
 if(min>max)return {state:'neutral',message:'Límites inconsistentes en el SetUp: revisar configuración'};
 const range=`Rango: ${min} – ${max}`;
 if(!value.trim())return {state:'neutral',message:`${range} · Pendiente de captura`};
 const n=number(value),ok=n!==null&&n>=min&&n<=max;
 return {state:ok?'valid':'invalid',message:`${range} · ${ok?'Dentro del rango':'Fuera del rango'}`};
}
