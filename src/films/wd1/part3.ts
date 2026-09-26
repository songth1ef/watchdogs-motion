import type { Scene } from '../../engine/types'
import { objects } from './part3/objects'
import { logo } from './part3/logo'
import { network } from './part3/network'
import { stage } from './part3/stage'
import { city } from './part3/city'
import { skyline, turnOut } from './part3/lights'

/**
 * WD1 100s–151s（镜头表见 docs/shots/wd1-part3.md）：
 * ctOS 物件网络 → Data is interconnected → 分类色块拼出 NETWORK → 舞台大屏 SHUTDOWN THE ENTIRE NORTHEAST
 * → 素模城市俯拍 _MESSAGE_WAS_CLEAR / HACKED → 手机上的城市 TURN OUT THE LIGHTS. → WATCH_DOGS 故障标志与标语
 */
export const part3: Scene[] = [objects, network, stage, skyline, city, turnOut, logo]
