// TODO: 完成 timer 的相关测试

// 预设时间间隔
import * as chalk from 'chalk';
import { isPositiveInt } from 'comsvr-ast';

const millisecond = 1;
const second = 1000;
const minute = 60 * second;
const halfHour = 30 * minute;
const hour = 2 * halfHour;
const halfDay = 12 * hour;
const day = 2 * halfDay;
const week = 7 * day;
const month = 30 * day;
const quarter = 3 * month;
const halfYear = 2 * quarter;
const year = 365 * day;

export const ticker = {
  millisecond,
  second,
  minute,
  halfHour,
  hour,
  halfDay,
  day,
  week,
  month,
  quarter,
  halfYear,
  year,
};

export type TimerFunc = (...params: any[]) => Promise<any>;

export type TaskID = string | number;

export type TimerTask = {
  id: TaskID; // 任务标识
  initRun: boolean; // 初始化时是否执行
  params: any[]; // 传递给任务方法的参数
  blocking: boolean; // 是否阻塞执行
  execNum: number; // 执行次数
  ticker: number; // 执行间隔时间，单位毫秒
  func: TimerFunc;
};

type TaskInfo = {
  id: TaskID; // 任务名称
  initRun: boolean; // 初始化时是否执行
  params: any[]; // 传递给任务方法的参数
  blocking: boolean; // 是否阻塞执行
  execNum: number; // 执行次数
  ticker: number; // 执行间隔时间，单位毫秒
  func: TimerFunc;
  executedNum: number; // 已执行次数
  lastExecTime: number; // 上次执行时间
  intervalID?: NodeJS.Timer;
  timeoutID?: NodeJS.Timeout;
};

/**
 * @class
 * @classdesc 指定时间间隔定时执行的定时任务池
 */
export class Timer {
  private _taskPool: Map<TaskID, TaskInfo>;
  private _lock: boolean;

  constructor() {
    this._taskPool = new Map<TaskID, TaskInfo>();
    this._lock = false;
  }

  private static exist(task: TimerTask | undefined): task is TimerTask {
    return task != undefined;
  }

  private timeoutCallBack(id: TaskID) {
    const task = this._taskPool.get(id);

    if (!Timer.exist(task)) {
      return;
    }

    if (task.execNum === 0 || task.executedNum <= task.execNum) {
      task.timeoutID = setTimeout(
        (...params: any[]) => {
          task.func(...params).finally(() => {
            this.timeoutCallBack(task.id);
          });
        },
        task.ticker,
        ...task.params,
      );
      this.updateTask(task);
    }
  }

  private updateTask(task: TaskInfo) {
    task.executedNum++;
    task.lastExecTime = Date.now();
    if (this._taskPool.has(task.id)) {
      this._taskPool.set(task.id, task);
    } else {
      if (task.intervalID) {
        clearInterval(task.intervalID);
      }
      if (task.timeoutID) {
        clearTimeout(task.timeoutID);
      }
    }
  }

  /***
   * @description 通过 id 注册任务池中的任务。仅能设置当前在任务池中不存在的 id。
   * @param { TimerTask } task 任务
   * @param { TaskID } task.id 任务标识
   * @param { boolean } task.initRun 是否在定时运行前先执行一次
   * @param { any[] } task.func 要执行的任务方法。
   * @param { any[] } task.params 要传给任务方法的参数，格式为 array， 在传入的时候会将 array 内的每一个元素按顺序传参。
   * @param { boolean } task.blocking 是否是阻塞执行，阻塞执行代表如果此次没有执行完，则等当前执行完再进行下一次的 ticker 等待（使用 setTimeout）。非阻塞则代表每次执行的时间间隔都是指定的时间间隔，不管上次是否执行完毕（使用 setInterval）。
   * @param { number } task.execNum 执行次数，范围 0 - 9999。0 代表不限制。
   * @param { number } task.ticker 执行时间间隔，单位毫秒，范围 1 - 86400000。
   * @returns { boolean } 是否注册成功，
   */
  registerTask(task: TimerTask): boolean {
    if (this._taskPool.has(task.id)) {
      chalk.yellow('Timer Task ', task.id, ' err: Not Fund');
      return false;
    }

    const { id, initRun, params, blocking, execNum, ticker, func } = task;

    // 判断参数范围
    if (!(execNum === 0 || (isPositiveInt(execNum) && execNum <= 9999))) {
      chalk.yellow(
        'Set Timer Task ',
        task.id,
        ' err: execNum Must In Scope 0 - 9999',
      );
      return false;
    }

    if (!(isPositiveInt(ticker) && ticker <= 86400000)) {
      chalk.yellow(
        'Set Timer Task ',
        task.id,
        ' err: ticker Must In Scope 1 - 86400000',
      );
      return false;
    }

    // 任务池内注册任务
    this._taskPool.set(id, {
      id,
      initRun,
      params,
      blocking,
      execNum,
      ticker,
      func,
      executedNum: 0,
      lastExecTime: Date.now(),
    });

    return true;
  }

  /***
   * @description 通过 id 注销任务池中的任务。仅能注销当前在任务池中存在的 id。
   * @param { TaskID } id 任务标识
   * @returns { boolean } 是否注销成功
   */
  unRegisterTask(id: TaskID): boolean {
    const taskInfo = this._taskPool.get(id);

    if (!taskInfo) {
      chalk.yellow('Timer Task ', id, ' err: Not Fund');
      return false;
    }

    if (taskInfo.intervalID) {
      clearInterval(taskInfo.intervalID);
    }

    if (taskInfo.timeoutID) {
      clearTimeout(taskInfo.timeoutID);
    }

    return this._taskPool.delete(id);
  }

  /***
   * @description 终止并清空整个任务池
   */
  clear() {
    this._taskPool.forEach((_, id: string | number) => {
      this.unRegisterTask(id);
    });
  }

  /***
   * @description 开始单个定时任务
   * @param { TaskID } id 任务标识
   * @returns { boolean } 是否启动成功
   */
  exec(id: TaskID): Promise<boolean> {
    return new Promise((resolve) => {
      const task = this._taskPool.get(id);

      if (!Timer.exist(task)) {
        chalk.yellow('Timer Task ', id, ' err: Not Fund');
        return resolve(false);
      }

      // 根据实际情况确定是否要先执行一次
      if (task.initRun) {
        task.func(...task.params).catch((reason) => {
          if (reason) {
            chalk.red('Timer Task ', task.id, ' err: ', reason);
          }
        });
      }

      // 阻塞执行使用 setTimeout，非阻塞使用 setInterval
      if (task.blocking) {
        this.timeoutCallBack(task.id);
      } else {
        task.intervalID = setInterval(
          (...params: any[]) => {
            const task = this._taskPool.get(id);

            if (!Timer.exist(task)) {
              return;
            }

            if (task.execNum === 0 || task.executedNum <= task.execNum) {
              task.func(...params).catch((reason) => {
                if (reason) {
                  chalk.red('Timer Task ', task.id, ' err: ', reason);
                }
              });
              this.updateTask(task);
            } else {
              clearInterval(task.intervalID);
            }
          },
          task.ticker,
          ...task.params,
        );
        this.updateTask(task);
      }

      return resolve(true);
    });
  }

  /***
   * @description 开始所有定时任务
   */
  execAll() {
    this._taskPool.forEach((_, id: string | number) => {
      this.exec(id).finally();
    });
  }

  /***
   * @description 停止并重置单个定时任务
   * @param { TaskID } id 任务标识
   */
  reset(id: TaskID) {
    const task = this._taskPool.get(id);

    if (!Timer.exist(task)) {
      return;
    }

    task.executedNum = 0;

    if (task.intervalID) {
      clearInterval(task.intervalID);
      task.intervalID = undefined;
    }

    if (task.timeoutID) {
      clearTimeout(task.timeoutID);
      task.timeoutID = undefined;
    }

    this._taskPool.set(task.id, task);
  }

  /***
   * @description 停止并重置所有定时任务
   */
  resetAll() {
    this._taskPool.forEach((_, id: string | number) => {
      this.reset(id);
    });
  }
}
