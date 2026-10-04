import { describe,it,expect } from 'vitest'
import { lightCanDim,supportsCardFeature,cardOptions } from './cardCapabilities'
describe('card capability gates',()=>{
 it('takes declared features over stale attributes and supports legacy absence',()=>{
  expect(supportsCardFeature({supported_features:0},4,true)).toBe(false)
  expect(supportsCardFeature({},4,true)).toBe(true)
  expect(supportsCardFeature({supported_features:12},4)).toBe(true)
 })
 it('keeps onoff lights free of misleading brightness controls',()=>{
  expect(lightCanDim({supported_color_modes:['onoff'],brightness:150})).toBe(false)
  expect(lightCanDim({supported_color_modes:['color_temp']})).toBe(true)
  expect(cardOptions(['eco',null,'eco',4,''])).toEqual(['eco'])
 })
})
