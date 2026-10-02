import {json,user} from '../../_lib/auth.js';
export async function onRequestGet({request,env}){try{const me=await user(request,env);return json({user:me||null})}catch{return json({error:'Datenbank nicht bereit'},503)}}
