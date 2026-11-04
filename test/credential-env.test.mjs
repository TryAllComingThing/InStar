import {test} from 'node:test';
import assert from 'node:assert/strict';
import {credentialEnv} from '../runtime/quality-controller/index.mjs';

test('credential environment detection covers common, cloud and toolchain secrets',()=>{
 const secretNames=['GITHUB_TOKEN','GH_TOKEN','AWS_SECRET_ACCESS_KEY','AWS_SESSION_TOKEN','AWS_ACCESS_KEY_ID','AZURE_CLIENT_SECRET','GOOGLE_APPLICATION_CREDENTIALS','CI_JOB_TOKEN','VAULT_TOKEN','DATABASE_URL','DB_URL','POSTGRES_URL','MYSQL_URL','REDIS_URL','JDBC_URL','NPM_CONFIG_TOKEN','NODE_OPTIONS','LD_PRELOAD','SSH_AUTH_SOCK','GIT_ASKPASS','API_KEY','PRIVATE_KEY','PASSWORD','REFRESH_TOKEN','ACCESS_TOKEN','CLIENT_SECRET','CODEX_HOME'];
 for(const name of secretNames)assert.equal(credentialEnv(name),true,`${name} should be treated as a credential`);
 const publicNames=['PATH','HOME','CI','npm_config_offline','LANG','TERM','USER','SHELL','NODE_ENV','DEBUG'];
 for(const name of publicNames)assert.equal(credentialEnv(name),false,`${name} should be inherited`);
});
