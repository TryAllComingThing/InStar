// Runtime evidence and workflow journals must not dirty reviewed source or CI.
export const isRuntimeState = name => /^(?:reports|logs|\.workflow|planning\/workflows)\//.test(name.replaceAll('\\','/')) || /^\.instar\/session\//.test(name) || /^\.context\/(PROJECT_STATE|LESSONS)\.md$/.test(name);
