Vue.component('llct-menu', {
  template: `<div class="llct-menu-in">
    <transition name="m-button" appear>
      <div class="m-button" data-index="1" v-on:click="changeTab(0)" v-bind:class="{active: currentTab == 0}">
        <i class="material-icons" title="메인">home</i>
        <p>메인</p>
      </div>
    </transition>
    <transition name="m-button" appear>
      <div class="m-button" data-index="2" v-on:click="changeTab(1)" v-bind:class="{active: currentTab == 1}">
        <i class="material-icons" title="음악">library_music</i>
        <p>음악</p>
      </div>
    </transition>
    <transition name="m-button" appear>
      <div class="m-button" data-index="3" v-on:click="popup()" v-bind:class="{active: currentTab == 2}">
        <i class="material-icons" title="재생목록">playlist_play</i>
        <p>재생목록</p>
      </div>
    </transition>
    <transition name="m-button" appear>
      <div class="m-button" data-index="4" v-on:click="changeTab(3)" v-bind:class="{active: currentTab == 3}">
        <i class="material-icons" title="지금 재생 중">equalizer</i>
        <p>재생 중</p>
      </div>
    </transition>
  </div>`,
  data: () => {
    return {
      currentTab: 0
    }
  },
  mounted () {
    this.$llctEvents.$on('changeTab', this.changeTabEvent)
  },
  beforeDestroy () {
    this.$llctEvents.$off('changeTab')
  },
  methods: {
    beforeEnter (el) {
      el.style.transitionDelay = 25 * parseInt(el.dataset.index, 10) + 'ms'
    },

    afterEnter (el) {
      el.style.transitionDelay = ''
    },

    changeTab (id) {
      this.$root.changeTab(id)
    },

    changeTabEvent (id) {
      this.currentTab = id
    },

    popup () {
      showModal('경고', 'Not Implemented')
    }
  }
})
