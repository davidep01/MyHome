import { describe,it,expect } from 'vitest'
import { changeEdit,decodeEdit,editHistory,encodeEdit,stepEdit } from './homeEditSession'
import { buildLayout } from './homeLayout'
const widgets = [{id:'w1',type:'entity' as const,size:'sm' as const,entityId:'light.room'}]
const draft = {widgets,layout:buildLayout(widgets),baseVersion:4}
describe('home edit sessions',()=>{
 it('undoes size changes, redoes and clears redo on a branch',()=>{
  const next={...draft,widgets:widgets.map(w=>({...w,size:'md' as const}))}
  const changed=changeEdit(editHistory(draft),next)
  const undone=stepEdit(changed,'undo')
  expect(undone.present.widgets[0].size).toBe('sm')
  expect(stepEdit(undone,'redo').present.widgets[0].size).toBe('md')
  expect(changeEdit(undone,{...draft,widgets:[]}).future).toHaveLength(0)
  expect(changed.present.baseVersion).toBe(4)
 })
 it('bounds memory and ignores duplicate changes',()=>{
  let h=editHistory(draft)
  expect(changeEdit(h,draft)).toBe(h)
  for(let i=0;i<60;i++)h=changeEdit(h,{...draft,baseVersion:i})
  expect(h.past).toHaveLength(40)
 })
 it('recovers a structural draft without persisting extra credentials or attributes',()=>{
  const raw=encodeEdit({...draft,widgets:[{...widgets[0],token:'secret',attributes:{password:'secret'}} as never]},1000)
  expect(raw).not.toContain('secret')
  expect(decodeEdit(raw,1001)?.baseVersion).toBe(4)
  expect(decodeEdit(raw,1001)?.widgets).toEqual(widgets)
 })
 it('rejects expired, malformed and duplicate drafts',()=>{
  expect(decodeEdit(encodeEdit(draft,1),86_400_002)).toBeNull()
  expect(decodeEdit('{')).toBeNull()
  expect(decodeEdit(encodeEdit({...draft,widgets:[...widgets,...widgets]}))).toBeNull()
 })
})
