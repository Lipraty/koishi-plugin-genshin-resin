import { Context, Schema, h } from 'koishi'
import { } from '@koishijs/plugin-help'
import { } from '@koishijs/cache'

interface GenshinResinOptions {
  platform: string
  userId: string
  resin: number
  updateAt: number
}

declare module '@koishijs/cache' {
  interface Tables {
    'genshin-resin': GenshinResinOptions
  }
}

export const name = 'genshin-resin'

export const using = ['cache']

export const usage = `
记录的你树脂恢复情况

请先发送例如 \`resin 10\` 命令来设置你当前的树脂，在超过阈值之后将发送消息提醒

直接发送 \`resin\` 命令则会查询至已恢复的树脂数量
`

export interface Config {
  alias: string[]
  trigger: number
  overflow: boolean
}

export const Config: Schema<Config> = Schema.object({
  alias: Schema.array(String).default(['体力', '树脂']).description('额外的命令别名'),
  trigger: Schema.number().min(130).max(160).default(150).description('恢复到该数量时提醒'),
  overflow: Schema.boolean().default(false).description('溢出 1 小时后提醒更新记录')
})

export function apply(ctx: Context, config: Config) {
  let init = true
  const logger = ctx.logger('genshin-resin')
  const cache = ctx.cache('genshin-resin')
  const usersTemp = []
  ctx.i18n.define('zh', require('./i18n/zh'))

  const resinInterval: number = 8
  const taskPool: Record<string, () => boolean> = {}
  function task(taskId: string, newTask: any) {
    if (taskPool[taskId]) taskPool[taskId]()
    taskPool[taskId] = newTask
  }
  function calcIntervalNumber(newTime: Date, oldTime: Date) {
    const interval = newTime.getTime() - oldTime.getTime()
    return (interval / 1000 / 60) / 8
  }

  ctx.on('ready', () => { init = true })

  ctx.on('message', (session) => {
    if (init) {
      init = false
      // const allTask = cache.all()
      // if (allTask.length > 0) {
      //   let count = 0
      //   allTask.forEach(t => {
      //     const num = calcIntervalNumber(new Date, new Date(t.updateAt))
      //     if (num < config.trigger - 20) {
      //       session.execute('resin -S ' + num)
      //       count++
      //     }
      //   })
      //   logger.info(`已恢复 ${count} 个任务`)
      // }
    }
  })

  ctx.command('resin [resin:number]')
    .alias('tili', 'tl', ...config.alias)
    .option('silent', '-S', { hidden: true })
    .userFields(['id'])
    .action(async ({ session, options }, resin) => {
      const userResins = await cache.get(session.userId)
      if (resin) {
        resin = Math.trunc(resin)

        if (resin > 160) return session.text('.max')
        if (resin >= config.trigger - 20) return session.text('.over', [config.trigger])
        if (usersTemp.includes(session.user.id)) return session.text('.many')

        const now = Date.now()
        const durationTime = (config.trigger - resin) * resinInterval * 60000 //ms
        const futureTime = new Date(now + durationTime)
        const prvt = session.subtype === 'prevate'
        const today = session.text('.saved.today'), nextday = session.text('.saved.nextday')

        //duplicate lock
        usersTemp.push(session.user.id)
        ctx.setTimeout(() => { if (usersTemp.length > 0) usersTemp.splice(usersTemp.findIndex(e => e === session.user.id), 1) }, 3600000) // No repeats allowed within 1 hour
        //cache some time's resin logger
        cache.set(session.userId, {
          platform: session.platform,
          userId: session.userId,
          resin,
          updateAt: now
        }, durationTime + ((160 - config.trigger) * resinInterval * 60000) + 3600000)
        //set remind message task
        task(session.userId, ctx.setTimeout(() => {
          session.send(session.text('.reached', [prvt ? '' : h('at', { id: session.userId }), config.trigger]))
        }, durationTime))
        //set overflow remind message task
        if (config.overflow)
          task(`overflow:${session.userId}`, ctx.setTimeout(() => {
            session.send(session.text('.filled', [prvt ? '' : h('at', { id: session.userId })]))
          }, durationTime + (160 - config.trigger) * resinInterval * 60000))

        if (!options.silent) {
          await session.send(
            session.text(
              `.saved.${userResins ? 'updated' : 'content'}`,
              [resin, config.trigger, futureTime.getDay() - new Date(now).getDay() === 0 ? today : nextday, futureTime.getHours(), futureTime.getMinutes()]
            ))
        }
      } else {
        if (!userResins) return session.text('.status.none')
        const status = Math.round(userResins.resin + calcIntervalNumber(new Date(), new Date(userResins.updateAt)))
        if (status >= 160) {
          session.send(session.text('.overflow', [status - 160]))
        } else {
          session.send(session.text('.status.content', [status, status >= 120 ? session.text('.status.filled') : '']))
        }
      }
    })

  ctx.on('dispose', () => {
    init = true
    //remove all task
    for (let task in usersTemp) {
      usersTemp[task]()
    }
  })
}
