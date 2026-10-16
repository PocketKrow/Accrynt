import { createRouter, createWebHashHistory } from 'vue-router'
import OverviewView from '../views/OverviewView.vue'
import PlanView from '../views/PlanView.vue'
import LedgerView from '../views/LedgerView.vue'
import DebtsView from '../views/DebtsView.vue'
import ReportsView from '../views/ReportsView.vue'
import SettingsView from '../views/SettingsView.vue'

export default createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: OverviewView },
    { path: '/plan', component: PlanView },
    { path: '/ledger', component: LedgerView },
    { path: '/debts', component: DebtsView },
    { path: '/reports', component: ReportsView },
    { path: '/settings', component: SettingsView },
    { path: '/:catchAll(.*)', redirect: '/' }
  ]
})
