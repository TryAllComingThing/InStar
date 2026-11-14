const UNSAFE_ENV = /(?:TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTHORIZATION|(?:^|_)API_KEY$|ACCESS_KEY|PRIVATE_KEY|(?:DATABASE|DB|POSTGRES(?:QL)?|MYSQL|MONGO(?:DB)?|REDIS|JDBC|ODBC)_URL|(?:^|_)(?:DSN|URI|CONNECTION_STRING|CERTIFICATE)(?:_|$)|^GH_|^GITHUB_|^AWS_|^AZURE_|^GOOGLE_APPLICATION_CREDENTIALS$|^NPM_CONFIG_.*(?:AUTH|TOKEN|USERCONFIG|GLOBALCONFIG)|^SSH_AUTH_SOCK$|^GIT_|^(?:SSH)_ASKPASS$|^CODEX_HOME$|^(?:NODE_OPTIONS|NODE_PATH|PYTHONPATH|PYTHONHOME|RUBYOPT|PERL5OPT|LD_PRELOAD|DYLD_[A-Z0-9_]+|BASH_ENV|ENV|SHELLOPTS|PS4)$)/i;

export function isUnsafeEnvironmentKey(key) {
  return typeof key !== 'string' || UNSAFE_ENV.test(key);
}

export function safeEnvironment(source = process.env) {
  return Object.fromEntries(Object.entries(source).filter(([key]) => !isUnsafeEnvironmentKey(key)));
}
