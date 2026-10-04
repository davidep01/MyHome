import { describe, it, expect } from 'vitest'
import { validStack, visibleStackIds } from './cardStack'
import { encodeEdit,decodeEdit,editHistory } from './homeEditSession'
import { buildLayout } from './homeLayout'
import type { HomeWidget } from '../api/backend'
describe('mixed card stacks',()=>{
 it('rejects cameras, duplicate IDs, recursion and oversized collections',()=>{
  expect(validStack({label:'Stanza',entityIds:['light.one','fan.two']})).toBe(true)
  for(const ids of [['light.one','camera.ring'],['light.one','light.one'],['light.one','w-stack'],Array.from({length:25},(_,i)=>`light.l${i}`)]) expect(validStack({label:'Stanza',entityIds:ids})).toBe(false)
  expect(validStack({label:' ',entityIds:['light.one','fan.two']})).toBe(false)
 })
 it('honours opt-in and hidden devices independently of availability',()=>{
  const ids=['light.one','fan.two','sensor.offline','switch.hidden','camera.ring']
  expect(visibleStackIds(ids,{ 'light.one':{enabled:true},'fan.two':{enabled:false},'sensor.offline':{enabled:true},'switch.hidden':{enabled:true}},['switch.hidden'])).toEqual(['light.one','sensor.offline'])
 })
 it('round trips label and members and snapshots do not share member arrays',()=>{
  const widget:HomeWidget={id:'collection',type:'stack',size:'md',label:'Stanza',entityIds:['light.one','fan.two']}
  const draft={widgets:[widget],layout:buildLayout([widget]),baseVersion:2}
  const history=editHistory(draft)
  widget.entityIds!.push('sensor.temp')
  expect(history.present.widgets[0].entityIds).toHaveLength(2)
  expect(decodeEdit(encodeEdit(history.present))?.widgets).toEqual(history.present.widgets)
 })
})
