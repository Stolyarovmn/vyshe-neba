const {chromium}=require('playwright');
module.exports={launch:options=>chromium.launch({...options,...(process.env.CHROMIUM_EXECUTABLE_PATH?{channel:undefined,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{}),args:[...(options?.args||[]),...(process.env.CHROMIUM_ARGS?JSON.parse(process.env.CHROMIUM_ARGS):[])]})};
