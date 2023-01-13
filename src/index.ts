import { Context, Schema, h } from 'koishi'
import cron from 'node-cron'

interface ResinManageJson {
  updateNumber: number
  updateAt: number
}

declare module 'koishi' {
  interface User {
    resin: ResinManageJson
  }
}

export const name = 'genshin-resin'

export const usage = `
手动记录的你树脂恢复情况

请先发送例如 \`resin 10\` 命令来设置你当前的树脂，在超过阈值之后将发送消息提醒

直接发送 \`resin\` 命令则会查询至已恢复的树脂数量
`

export interface Config {
  noticeThreshold: number
  recordNotice: boolean
}

export const Config: Schema<Config> = Schema.object({
  noticeThreshold: Schema.number().min(0).max(160).default(150).description('恢复到该数量时提醒'),
  recordNotice: Schema.boolean().default(false).description('溢出 1 小时 (160) 后提醒更新记录')
})

export function apply(ctx: Context, config: Config) {
  const logger = ctx.logger('genshin-resin')

  ctx.model.extend('user', {
    resin: 'json'
  })

  ctx.command('resin [number]', '记录或获取树脂')
    .alias('树脂', '体力', 'tili', 'tl')
    .userFields(['id', 'resin'])
    .action(async ({ session }, _resin) => {
      if (_resin) {
        const resinInterval: number = 8
        const resin = +_resin
        if(resin > 160){
          return '错误的树脂数量，上限为 160 个'
        }
        const now = Date.now()
        const durationMinute = (config.noticeThreshold - resin) * resinInterval
        const cramDate = formatTime(now, durationMinute).split(':')
        // 更新记录时间
        session.user.resin = {
          updateNumber: resin,
          updateAt: now
        }
        session.send(`保存成功！你当前树脂为 ${resin} 个，将在 ${cramDate[0]} 小时 ${cramDate[1].length === 1 ? '0' + cramDate[1] : cramDate[1]} 分钟后达到预设的 ${config.noticeThreshold} 个。`)
        try {
          if (config.recordNotice) {
            const durationMax = (160 - resin) * resinInterval
            cron.schedule(formatCron(durationMax), () => {
              if (session.subtype === 'prevate')
                session.send(`树脂已恢复到 ${config.noticeThreshold} 个，请及时清理哦！`)
              else
                session.send(`${h('at', { id: session.userId })}，你的树脂已恢复到 ${config.noticeThreshold} 个，请及时清理哦！`)
            })
          }
          cron.schedule(formatCron(durationMinute), () => {
            if (session.subtype === 'prevate')
              session.send(`树脂已恢复到 ${config.noticeThreshold} 个，请及时清理哦！`)
            else
              session.send(`${h('at', { id: session.userId })}，你的树脂已恢复到 ${config.noticeThreshold} 个，请及时清理哦！`)
          })
        } catch (error) {
          logger.error('fail executing cron:', error)
        }
      } else {
        const created = Math.round(session.user.resin.updateNumber + calcTimeCount(new Date(), new Date(session.user.resin.updateAt)))
        session.send(`树脂已恢复到 ${created} 个${created >= 120 ? '，记得及时清理哦！' : ''}`)
      }
    })
}

/**
 * 将分钟转为 GNU crontab 时间格式
 * 
 * 由于最高仅 160 * 8 ≈ 21 小时，不考虑多一天的情况
 */
function formatCron(minute: number) {
  if (minute > 59) {
    const T = (minute / 60).toString().split('.')
    return `* ${roundMinute(+T[1])} ${T[0]} * * *`
  } else {
    return `* ${minute} * * * *`
  }
}

function formatTime(now: number, minute: number) {
  const interval = ((new Date(now).setMinutes(new Date(now).getMinutes() + minute) - now) / 1000 / 60 / 60)
  const t = interval.toString().split('.')
  return [t[0], t[1] ? roundMinute(+t[1]) : 0].join(':')
}

/** 计算时间内可生成树脂数量 */
function calcTimeCount(newTime: Date, oldTime: Date) {
  const interval = newTime.getTime() - oldTime.getTime()
  return (interval / 1000 / 60) / 8
}

const roundMinute = (minute: number) => Math.round(60 * (+('0.' + minute)))
