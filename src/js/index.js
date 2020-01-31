Vue.prototype.$llctEvents = new Vue()
var siteTest = /lovelivec\.kr/g
Vue.use(VueLazyload, {
  filter: {
    webp (listener, _) {
      if (!window.webpSupport || !siteTest.test(listener.src)) return
      listener.src += '?webp'
    }
  }
})
;(() => {
  var img = new Image()
  img.onload = function () {
    var result = img.width > 0 && img.height > 0
    window.webpSupport = result
  }
  img.onerror = function () {
    window.webpSupport = false
  }
  img.src =
    'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA'
  // lossless: 'UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==',
  // alpha: 'UklGRkoAAABXRUJQVlA4WAoAAAAQAAAAAAAAAAAAQUxQSAwAAAARBxAR/Q9ERP8DAABWUDggGAAAABQBAJ0BKgEAAQAAAP4AAA3AAP7mtQAAAA==',
})()

const init = () => {
  var app = new Vue({
    el: 'llct-app',
    data: () => {
      return {
        tabs: [
          {
            title: '둘러보기',
            desc: ''
          },
          {
            title: '곡 목록',
            desc: ''
          },
          {
            title: '재생목록',
            desc: ''
          },
          {
            title: '현재 재생중',
            desc: '',
            hide: true
          }
        ],
        currentTab: 0,
        title: '둘러보기',
        desc: ''
      }
    },
    methods: {
      updateTitle (title, desc, hide) {
        this.title = title
        this.desc = desc
        this.hide = hide
      },

      changeTab (id) {
        this.prevTab = this.currentTab

        if (this.tabs[id]) {
          this.updateTitle(
            this.tabs[id].title,
            this.tabs[id].desc,
            this.tabs[id].hide || false
          )
        }

        this.$llctEvents.$emit('changeTab', id)

        this.currentTab = id
      },

      goBackTab () {
        return this.changeTab(this.prevTab)
      }
    },
    mounted () {
      this.changeTab(0)

      this.$llctEvents.$on('requestChangeTab', id => {
        this.changeTab(id)
      })

      this.$llctEvents.$on('requestGoBack', () => {
        this.goBackTab()
      })

      this.$llctEvents.$on('play', id => {
        this.changeTab(3)

        let info = this.$llctDatas.getSong(id)

        this.$llctDatas.meta = info
        this.$llctDatas.playActive = true

        audio.load(this.$llctDatas.base + '/audio/' + id)
      })
    }
  })

  var menu = new Vue({
    el: 'llct-menu',
    methods: {
      changeTab (id) {
        app.changeTab(id)
      }
    }
  })

  var audio = new LLCTAudio({})

  window.app = app
  window.menu = menu
  window.audio = audio
}
