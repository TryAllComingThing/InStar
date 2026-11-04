const secretKey=/^(authorization|apikey|accesstoken|refreshtoken|clientsecret|password|passwd|credential|privatekey|secret|token)$/i;
const isSecretKey=key=>!/(?:hash|digest)$/i.test(key)&&secretKey.test(String(key).replace(/[-_]/g,''));
export function redactText(input){
 return String(input)
  .replace(/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,'[REDACTED PRIVATE KEY]')
  .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16}|sk-[A-Za-z0-9_-]{24,})\b/g,'[REDACTED SECRET]')
  .replace(/\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g,'[REDACTED JWT]')
  .replace(/(\bauthorization\s*[:=]\s*bearer\s+)[^\s,;"']+/ig,'$1[REDACTED]')
  .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,'Bearer [REDACTED]')
  .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passwd|credential|secret|token)\s*["']?\s*[:=]\s*["']?)[^\s,;&"']+/ig,'$1[REDACTED]')
  .replace(/([?&](?:token|access_token|api_key|key|signature)=)[^&#\s]+/ig,'$1[REDACTED]');
}
export function redactData(value){
 if(typeof value==='string')return redactText(value).slice(0,12000);
 if(Array.isArray(value))return value.map(redactData);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,isSecretKey(key)?'[REDACTED]':redactData(item)]));
 return value;
}
export function boundedText(value,maxLength=3000){
 const safe=redactText(value).trim();return safe.length>maxLength?`${safe.slice(0,maxLength)}…[truncated]`:safe;
}
