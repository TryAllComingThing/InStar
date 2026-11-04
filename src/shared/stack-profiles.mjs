const reviewValues=value=>value===undefined||value===null?[]:Array.isArray(value)?value:[value];
const lowerValues=value=>reviewValues(value).map(item=>String(item).toLowerCase()).filter(Boolean);

export const universalReviewItems=['correctness','maintainability','architecture','security','performance','naming'];
export const vueReviewItems=['types','component-boundaries','design','watch-cleanup','v-for-key','reactive-destructure','props','computed-purity','unmount-cleanup','async-component','lazy-route'];
export const reactReviewItems=['types','component-boundaries','hooks-rules','state-ownership','effect-cleanup','memoization','accessibility'];
export const svelteReviewItems=['types','component-boundaries','reactivity','lifecycle-cleanup','accessibility'];
export const angularReviewItems=['types','component-boundaries','change-detection','subscription-cleanup','dependency-injection','accessibility'];
export const backendReviewItems=['api-contract','input-validation','authorization','error-handling','data-consistency','transactions','concurrency','observability'];
export const nodeReviewItems=['async-errors','input-validation','authorization','resource-cleanup','observability'];
export const rustReviewItems=['unsafe-usage','ownership-model','error-propagation','concurrency-safety'];
export const dotnetReviewItems=['nullable-safety','async-correctness','di-lifetime','ef-migrations'];

export const reviewItemsByLanguage={
 python:backendReviewItems,
 java:backendReviewItems,
 go:backendReviewItems,
 node:nodeReviewItems,
 rust:rustReviewItems,
 csharp:dotnetReviewItems,
 typescript:[],
 javascript:[],
};

export const reviewItemsByFramework={
 vue:vueReviewItems,
 react:reactReviewItems,
 svelte:svelteReviewItems,
 angular:angularReviewItems,
 node:nodeReviewItems,
 dotnet:dotnetReviewItems,
 none:[],
};

export const uiFrameworks=['vue','react','svelte','angular'];
export const backendLanguages=['python','java','go'];
export const validReviewLanguages=Object.freeze(['typescript','javascript','python','java','go','rust','csharp','node']);
export const validReviewFrameworks=Object.freeze(['vue','react','svelte','angular','node','dotnet','none']);
export const validReviewSurfaces=Object.freeze(['web','browser','cli','service','library','none']);

export const pathStackRules=Object.freeze({
 '.ts':{language:'typescript'},
 '.tsx':{language:'typescript'},
 '.js':{language:'javascript'},
 '.jsx':{language:'javascript'},
 '.mjs':{language:'javascript'},
 '.cjs':{language:'javascript'},
 '.vue':{language:'typescript',framework:'vue'},
 '.svelte':{language:'typescript',framework:'svelte'},
 '.py':{language:'python'},
 '.go':{language:'go'},
 '.java':{language:'java'},
 '.rs':{language:'rust'},
 '.cs':{language:'csharp',framework:'dotnet'},
 '.csproj':{language:'csharp',framework:'dotnet'},
 '.sln':{language:'csharp',framework:'dotnet'},
 '.kt':{language:'kotlin'},
 '.kts':{language:'kotlin'},
 '.swift':{language:'swift'},
 '.sql':{language:'sql'},
});

export function reviewItemsForConfig(config){
 const languages=lowerValues(config?.review?.language),frameworks=lowerValues(config?.review?.framework);
 if(!languages.length&&!frameworks.length)return [...universalReviewItems];
 const specific=[];
 for(const language of languages)specific.push(...(reviewItemsByLanguage[language]||[]));
 for(const framework of frameworks)specific.push(...(reviewItemsByFramework[framework]||[]));
 if(config?.review?.extraChecks!==undefined)specific.push(...config.review.extraChecks);
 return [...new Set([...universalReviewItems,...specific])];
}

export function hasFrontendSurface(config){
 const frameworks=lowerValues(config?.review?.framework),surfaces=lowerValues(config?.review?.surface);
 if(surfaces.some(value=>['web','browser'].includes(value)))return true;
 if(surfaces.length)return false;
 return frameworks.some(value=>uiFrameworks.includes(value));
}

export function stackForConfig(config){
 return [...new Set(lowerValues(config?.review?.language).flatMap(language=>language==='typescript'?['typescript','javascript']:[language]))];
}

export function detectedStackFor({languages=[],frameworks=[],hasPackageJson=false}={}){
 const languageSet=new Set(languages),frameworkSet=new Set(frameworks);
 if(languageSet.has('python')&&[...frameworkSet].some(value=>uiFrameworks.includes(value)))return 'full-stack';
 for(const value of uiFrameworks)if(frameworkSet.has(value))return value;
 if(languageSet.has('rust'))return 'rust';
 if(languageSet.has('csharp')||frameworkSet.has('dotnet'))return 'dotnet';
 if(languageSet.has('python'))return 'python';
 if(frameworkSet.has('node'))return 'node';
 if(hasPackageJson)return 'javascript';
 return 'unknown';
}

export function inferPathStack(paths=[]){
 const languages=new Set(),frameworks=new Set();
 for(const value of paths){
  const file=String(value).replaceAll('\\','/').trim(),extension=file.match(/\.[^.]+$/)?.[0]?.toLowerCase();
  const rule=extension?pathStackRules[extension]:null;
  if(rule?.language)languages.add(rule.language);
  if(rule?.framework)frameworks.add(rule.framework);
 }
 return {languages:[...languages].sort(),frameworks:[...frameworks].sort()};
}
