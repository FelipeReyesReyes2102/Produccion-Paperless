import {useState} from 'react';
export function ProfileAvatar({name,photo}:{name?:string;photo?:string}){const[failed,setFailed]=useState('');const url=photo?'/'+photo.replace(/^\/+/, ''):'';return <div className="avatar">{url&&failed!==url?<img src={url} alt={`Foto de ${name||'usuario'}`} onError={()=>setFailed(url)}/>:name?.split(' ').map(x=>x[0]).slice(0,2).join('')}</div>}
