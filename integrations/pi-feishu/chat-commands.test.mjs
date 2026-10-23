import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {handleFeishuMessage} from './patched-package/dist/bridge/message-handler.js';

function fixture(text) {
  const calls=[];
  const model={provider:'fixture',id:'test-model',name:'Fixture'};
  const host={queue:{depth:0},runtime:{services:{modelRuntime:{
    getAvailableSnapshot:()=>[model],getModel:(p,id)=>p===model.provider&&id===model.id?model:undefined,
  }},session:{model:{...model,id:'old-model'},thinkingLevel:'off',setModel:async m=>calls.push(['model',m])}}};
  const options={config:{appId:'cli_fixture',policy:{dmEnabled:true,groupEnabled:true,requireMention:true},sessions:{groupScope:'per-user'}},
    message:{text,chatId:'chat',messageId:'message',userOpenId:'user',chatType:'private'},
    manager:{getHost:async()=>{calls.push(['host']);return host;}},store:{},
    channel:{sendText:async(_chat,text)=>calls.push(['text',text]),sendCard:async(_chat,card)=>calls.push(['card',card])}};
  return {options,calls,host};
}

test('help and unknown commands reply without initializing Agent or generating',async()=>{
  for(const command of ['/help','/unknown']) {
    const f=fixture(command);await handleFeishuMessage(f.options);
    assert.equal(f.calls.some(c=>c[0]==='host'),false);
    assert.ok(f.calls.some(c=>['card','text'].includes(c[0])));
  }
});

test('pwd reads only the current mapping or configured default without initializing Agent',async()=>{
  for (const mapping of [{cwd:resolve('fixture-session')}, undefined]) {
    const f=fixture('/pwd');
    f.options.config.sessions.defaultCwd='fixture-default';
    f.options.store.getSessionMapping=async key=>{assert.equal(key,'dm:user');return mapping;};
    await handleFeishuMessage(f.options);
    assert.equal(f.calls.some(c=>c[0]==='host'),false);
    assert.equal(f.calls.find(c=>c[0]==='text')[1],`当前工作目录：\n${mapping?.cwd ?? resolve('fixture-default')}`);
  }
});

test('cancel aborts only the current session and is still subject to access policy',async()=>{
  const f=fixture('/cancel');
  f.options.manager.abort=async key=>{f.calls.push(['abort',key]);return true;};
  await handleFeishuMessage(f.options);
  assert.equal(f.calls.find(c=>c[0]==='abort')[1],'dm:user');
  assert.equal(f.calls.some(c=>c[0]==='host'),false);
  const denied=fixture('/cancel');
  denied.options.config.policy.allowUsers=[];
  denied.options.manager.abort=async()=>assert.fail('unauthorized abort');
  await handleFeishuMessage(denied.options);
  assert.equal(denied.calls.some(c=>c[0]==='host'),false);
});

test('model and models open the same picker before attachments or generation',async()=>{
  for(const command of ['/model','/models']) {
    const f=fixture(command);await handleFeishuMessage(f.options);
    assert.ok(f.calls.some(c=>c[0]==='card'));
    assert.equal(f.calls.some(c=>c[0]==='model'),false);
  }
});

test('model switches only an available model in an idle current session',async()=>{
  const f=fixture('/model fixture/test-model');await handleFeishuMessage(f.options);
  assert.equal(f.calls.find(c=>c[0]==='model')?.[1].id,'test-model');
  const same=fixture('/model fixture/test-model');same.host.runtime.session.model.id='test-model';
  await handleFeishuMessage(same.options);
  assert.equal(same.calls.some(c=>c[0]==='model'),false);
  for(const state of ['active','queued','invalid','denied','fail']) {
    const f=fixture(state==='invalid'?'/model fixture/missing':'/model fixture/test-model');
    if(state==='active')f.host.activeRun={};
    if(state==='queued')f.host.queue.depth=1;
    if(state==='denied')f.options.config.policy.allowUsers=[];
    if(state==='fail')f.host.runtime.session.setModel=async()=>{throw new Error('fixture');};
    await handleFeishuMessage(f.options);
    assert.equal(f.calls.some(c=>c[0]==='model'),false);
    assert.ok(f.calls.some(c=>c[0]==='text'));
  }
});
