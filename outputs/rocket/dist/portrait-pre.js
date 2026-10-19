/* Portrait bootstrap: keep JS input mapping unrotated while native CSS still sees coarse pointer. */
(function(root){
'use strict';
if(root.PortraitBootstrap?.installed)return;
const native=root.matchMedia?.bind(root);
function portrait(){let vv=root.visualViewport;return Number(vv?.height||root.innerHeight)>Number(vv?.width||root.innerWidth)&&Number(root.navigator?.maxTouchPoints||0)>0;}
if(native){root.matchMedia=function(query){let m=native(query);if(query==='(pointer:coarse)'&&portrait())return new Proxy(m,{get(target,key){if(key==='matches')return false;let v=target[key];return typeof v==='function'?v.bind(target):v;}});return m;};}
root.PortraitBootstrap={installed:true,isPortrait:portrait,nativeMatchMedia:native};
})(window);
