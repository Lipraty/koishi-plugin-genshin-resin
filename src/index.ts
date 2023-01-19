import { Context, Schema, h } from 'koishi'

declare module 'koishi' {
  interface User {
    resin: ResinDatabase
  }
}

interface ResinDatabase {
  updateNumber: number
  updateAt: number
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
  

  ctx.i18n.define('zh', require('./i18n/zh'))

  ctx.model.extend('user', {
    resin: 'json'
  })

  ctx.command('resin [number]')
    .alias('树脂', '体力', 'tili', 'tl')
    .userFields(['resin'])
    .action(async ({ session }, _resin) => {
      if (_resin) {
        const resin = Math.trunc(+_resin)
        if (resin > 160)
          return session.text('commands.resin.msg.errorNum')
        const resinInterval: number = 8
        const now = Date.now()
        // if (session.user.resin.updateAt && new Date(now).getHours() - new Date(session.user.resin.updateAt).getHours() <= 1) {
        //   return session.text('commands.resin.msg.errorMany')
        // }
        const durationTime = (config.noticeThreshold - resin) * resinInterval * 60 * 1000 //ms
        const futureTime = new Date(now + durationTime)
        const priv = session.subtype === 'prevate'
        session.user.resin = {
          updateNumber: resin,
          updateAt: now
        }
        const today = session.text('commands.resin.msg.saved.today'), nextday = session.text('commands.resin.msg.saved.nextday')
        session.send(
          session.text(
            'commands.resin.msg.saved.content',
            [resin, config.noticeThreshold, futureTime.getDay() - new Date(now).getDay() === 0 ? today : nextday, futureTime.getHours(), futureTime.getMinutes()]
          ))
        if (config.recordNotice) {
          ctx.setTimeout(() => {
            session.send(session.text('commands.resin.msg.overflow', [config.noticeThreshold, priv ? '' : h('at', { id: session.userId })]))
          }, durationTime + ((160 - config.noticeThreshold) * resinInterval))
        }
        ctx.setTimeout(() => {
          session.send(session.text('commands.resin.msg.filled', [config.noticeThreshold, priv ? '' : h('at', { id: session.userId })]))
        }, durationTime)
      } else {
        const created = Math.round(session.user.resin.updateNumber + calcIntervalNumber(new Date(), new Date(session.user.resin.updateAt)))
        if (created >= 160) {
          session.send(session.text('commands.resin.msg2.overflow', [created - 160]))
        } else {
          session.send(session.text('commands.resin.msg2.status.content', [created, created >= 120 ? session.text('commands.resin.msg2.status.filled') : '']))
        }
      }
    })
}

function calcIntervalNumber(newTime: Date, oldTime: Date) {
  const interval = newTime.getTime() - oldTime.getTime()
  return (interval / 1000 / 60) / 8
}
