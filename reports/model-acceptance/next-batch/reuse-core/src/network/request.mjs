import {headers} from './internal/headers.mjs';
export async function request(path,transport){const response=await transport(path,{headers:headers()});if(!response.ok)throw new Error('REQUEST_FAILED');return response.json();}
