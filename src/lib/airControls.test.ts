import {it,expect} from 'vitest'
import {fanControls,fanPercentage,humidityTarget,humidityModes} from './airControls'
it('uses supported features and real percentage steps',()=>{
 expect(fanControls({supported_features:1,oscillating:true,direction:'forward'})).toMatchObject({speed:true,oscillation:false,direction:false})
 expect(fanControls({supported_features:6})).toMatchObject({speed:false,oscillation:true,direction:true})
 expect(fanPercentage(42,{percentage_step:25})).toBe(50)
 expect(fanPercentage(76,{percentage_step:100/3})).toBe(67)
})
it('keeps humidity within integration limits including fractional steps',()=>{
 expect(humidityTarget(50,{min_humidity:70,max_humidity:30})).toBe(50)
 expect(humidityTarget(10,{min_humidity:30,max_humidity:70})).toBe(30)
 expect(humidityTarget(82,{min_humidity:30,max_humidity:70})).toBe(70)
 expect(humidityTarget(43.4,{min_humidity:30,max_humidity:70,target_humidity_step:0.5})).toBe(43.5)
})

it('does not offer modes when an integration explicitly omits that feature', () => {
 expect(fanControls({supported_features:1,preset_modes:['eco']})).toMatchObject({presets:false})
 expect(fanControls({supported_features:8,preset_modes:['eco']})).toMatchObject({presets:true})
 expect(humidityModes({supported_features:0,available_modes:['eco']})).toEqual([])
 expect(humidityModes({supported_features:1,available_modes:['eco',null,42]})).toEqual(['eco'])
 expect(fanPercentage(NaN,{})).toBe(0)
})
