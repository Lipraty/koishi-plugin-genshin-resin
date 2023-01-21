import { Context, Schema, Session, h } from 'koishi'


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
  noticeThreshold: Schema.number().min(130).max(160).default(150).description('恢复到该数量时提醒'),
  recordNotice: Schema.boolean().default(false).description('溢出 1 小时后提醒更新记录')
})

export function apply(ctx: Context, config: Config) {
  const logger = ctx.logger('genshin-resin')
  const resinInterval: number = 8
  const taksPool = []
  const newTask = (session: Session, id, channelAt, time: number) => {
    time = time * 60 * 1000
    if (config.recordNotice)
      taksPool[id] = ctx.setTimeout(() => { session.send(session.text('commands.resin.msg.overflow', [channelAt ? '' : h('at', { id: channelAt })])) }, time + ((160 - config.noticeThreshold) * resinInterval * 60000) + 3600000)
    taksPool[id] = ctx.setTimeout(() => { session.send(session.text('commands.resin.msg.filled', [channelAt ? '' : h('at', { id: channelAt })])) }, time)
  }

  ctx.i18n.define('zh', require('./i18n/zh'))

  ctx.model.extend('user', {
    resin: 'json'
  })

  ctx.before('attach-user', (session, fields) => {
    fields.add('id')
    fields.add('resin')
  })

  ctx.on('message', (session: Session<'id' | 'resin'>) => {
    
  })

  ctx.on('attach-user', async (session) => {
    const userResins = await ctx.database.get('user', { resin: { $exists: true } })
    let count = 0
    userResins.forEach(usrRow => {
      const grow = Math.round(usrRow.resin.updateNumber + calcIntervalNumber(new Date(), new Date(usrRow.resin.updateAt)))
      if (grow < config.noticeThreshold) {
        newTask(session, usrRow.id, session.subtype === 'private' ? '' : usrRow.id, config.noticeThreshold - grow)
        count++
      }
    })
    if (count > 0)
      logger.info(`已从数据库中恢复 ${count} 个未完成的 resin 计时任务`)
    else
      logger.info('未从数据库中找到需要恢复的任务')
  })

  ctx.command('resin [number]')
    .alias('树脂', '体力', 'tili', 'tl')
    .userFields(['id', 'resin'])
    .action(async ({ session }, _resin) => {
      if (_resin) {
        const resin = Math.trunc(+_resin)
        if (resin > 160)
          return session.text('commands.resin.msg.errorNum')
        if (resin >= config.noticeThreshold)
          return session.text('commands.resin.msg.errorOver', [config.noticeThreshold])
        const now = Date.now()
        if (session.user.resin.updateAt && new Date(now).getHours() - new Date(session.user.resin.updateAt).getHours() <= 1) {
          return session.text('commands.resin.msg.errorMany')
        }
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
        newTask(session, session.user.id, session.subtype === 'private' ? '' : session.userId, durationTime)
      } else {
        const created = Math.round(session.user.resin.updateNumber + calcIntervalNumber(new Date(), new Date(session.user.resin.updateAt)))
        if (created >= 160) {
          session.user.resin.updateNumber = 160
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
