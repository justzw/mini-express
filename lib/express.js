const url = require('url')
const path = require('path')
const fs = require('fs')

/**
 * createApplication()作为一个工厂函数，核心功能即负责生产一个app函数，用来为server注册一个'request'事件的侦听器
 */
function createApplication () {
  let set = {}
  let routes = []

  const app = function (req, res) {
    /**
     * 1.扩展request --> Request API
     * 基于http模块中req对象提供的原生API，解析HTTP请求中的信息，并为req对象挂载新的API，从而更方便获取解析出的信息数据
     */
    // 利用'url'模块将请求url字符串解析为一个url对象
    const urlObj = url.parse(req.url, true)
    // 获取请求url的pathname，并挂载在req上
    req.path = urlObj.pathname
    // 获取HTTP请求的方法
    req.method
    // 获取请求url中的query，并挂载在req上
    req.query = urlObj.query
    // 调用中间路由的中间件，统一在下面调用
    

    /**
     * 2.扩展response --> Response API
     * 基于http模块中res对象或其他对象提供的原生API，为res对象封装新的API，从而更方便的向客户端做出响应
     */
    // 因为res.write()和res.end()只能接受字符串参数，所以重新封装一个res.send()，可以接收多种类型参数
    res.send = toSend => {
      switch (typeof toSend) {
        case 'string':
          res.end(toSend)
          break
        case 'number':
          res.end(toSend.toString())
          break
        case 'object':
          res.end(JSON.stringify(toSend))
          break;
        default:
          throw new Error('参数类型错误')
      }
    }
    // 封装一个用于渲染模板文件的统一方法，res.render()
    res.render = (tplPath, data) => {
      const fullPath = path.join(app.get('views'), tplPath)

      (require(app.get('view engine'))).renderFile(fullPath, data, {}, (err, str) => {
        if (err) {
          res.writeHead(503, 'System error')
          res.end() 
        } else {
          res.setHeader('content-type', 'text/html')
          res.writeHead(200, 'Ok')
          res.write(str)
          res.end()         
        }
      })
    }

    /**
     * 3.操作Model和View，做出响应
     */
    // 中间路由或路由的执行机制，逐一匹配中间路由或路由的routePath/routeMethod与req.path/req.method，匹配成功就调用routeHandle/middleware
    let count = 0 
    const next = () => {
      let route = routes[count++]

      if (!count) return
      // 判断pathname和method与route的routePath和routeMethod是否一致
      if (route.routePath.test(req.path)) {
        if (route.routeMethod === 'ALL' || route.routeMethod === req.method) {
          route.routeHandle(req, res, next)
        } else {
          next()
        }
      } else {
        next()
      }
    }

    next()
  }

  /**
   * Application API
   * 为app对象定义一些属性/方法/事件，向外界提供一些API，方便一些操作
   */
  // (1) 设置或获取一些全局参数
  // app.set(key, value)
  app.set = (key, value) => set[key] = value
  // app.get(key)
  app.get = key => set[key]

  // (2) 添加中间件
  // app.use([routePath, ]...middlewares)
  app.use = (routePath, ...middlewares) => {
    if (routePath instanceof RegExp) {
      routePath = new RegExp(`^${routePath.source}.*`)
    }
    if (typeof routePath === 'function') {
      middlewares.unshift(routePath)
      routePath = /^\/.*/
    } 
    if (typeof routePath === 'string') {
      routePath = new RegExp(`^${escapeRegExp(routePath)}.*`)
    } 
    middlewares.forEach(middleware => {
      routes.push({
        routePath: routePath,
        routeMethod: 'ALL',
        routeHandle: middleware
      })
    })
  }

  // (3) 添加路由
  const escapeRegExp = (str) => str.replace(/[\-\[\]\/\{\}\.\\\^\$\|]/g, '\\$&')
  // app.routeMethod(routePath, ...routeHandles)
  app.get = (routePath, ...routeHandles) => {
    if (typeof routePath === 'string') {
      routePath = new RegExp(`^${escapeRegExp(routePath)}$`)
    } 
    routeHandles.forEach(routeHandle => {
      routes.push({
        routePath: routePath,
        routeMethod: 'GET',
        routeHandle: routeHandle
      })
    })
  }
  app.post = (routePath, ...routeHandles) => {
    if (typeof routePath === 'string') {
      routePath = new RegExp(`^${escapeRegExp(routePath)}$`)
    } 
    routeHandles.forEach(routeHandle => {
      routes.push({
        routePath: routePath,
        routeMethod: 'POST',
        routeHandle: routeHandle
      })
    })
  }
  app.all = (routePath, ...routeHandles) => {
    if (typeof routePath === 'string') {
      routePath = new RegExp(`^${escapeRegExp(routePath)}$`)
    } 
    routeHandles.forEach(routeHandle => {
      routes.push({
        routePath: routePath,
        routeMethod: 'ALL',
        routeHandle: routeHandle
      })
    })
  }
   
  return app
}

/**
 * createApplication()内置的生产静态文件路由的routeHandle的工厂函数 
 */
createApplication.static = publicPath => (req, res, next) => {
  const urlObj = url.parse(req.url, true)
  const pathName = urlObj.pathname
  const fileName = (pathName === '/')
    ? path.join(publicPath, 'index.html')
    : path.join(publicPath, pathName)

  fs.readFile(fileName, (err, data) => {
    if (err) {
      res.writeHead(404, 'not found')
      res.end('<h1>404 Not Found</h1>')
    } else {
      res.writeHead(200, 'ok')
      res.end(data)
    }
  })
}

module.exports = createApplication