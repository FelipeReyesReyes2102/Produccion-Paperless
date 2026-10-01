import {isAxiosError} from 'axios';
export function errorText(error:unknown):string {
 if(isAxiosError(error)){const detail=error.response?.data?.detail;return typeof detail==='string'?detail:Array.isArray(detail)?detail.map(x=>x.msg).join('. '):'No fue posible conectar con el servidor.'}
 return 'No fue posible completar la operación.';
}
