import { A, IN } from '../actions/actions.js';
import { S, mem } from '../core/store.js';
import { esc } from '../core/utils.js';
import { openModal } from '../overlays/modals.js';
import { render } from '../shell/render.js';
import { mutate, toast } from './toast.js';

export function editMemberProfile(el) {
  if (S.ui.currentUser?.role !== 'admin') return;
  const member = mem(el.dataset.id);
  if (!member) return;
  S.ui.memberProfileDraft = { id: member.id, name: member.name, title: member.title || '' };
  S.ui.errors = {};
  openModal({ type: 'memberProfile', id: member.id });
}

export function memberProfileModal(modal, heading) {
  const draft = S.ui.memberProfileDraft;
  if (S.ui.currentUser?.role !== 'admin' || !draft || draft.id !== modal.id || !mem(modal.id)) return '';
  return `${heading('Edit member profile', esc(mem(modal.id).email))}<form class="modal-b" data-submit="saveMemberProfile"><div class="field"><label class="label" for="member-profile-name">Full name</label><input class="input" id="member-profile-name" data-in="memberProfileField" data-field="name" value="${esc(draft.name)}" maxlength="120" autofocus required aria-invalid="${!!S.ui.errors.memberProfile}">${S.ui.errors.memberProfile ? '<span class="err">Full name is required.</span>' : ''}</div><div class="field"><label class="label" for="member-profile-title">Job title</label><input class="input" id="member-profile-title" data-in="memberProfileField" data-field="title" value="${esc(draft.title)}" maxlength="160"></div></form><div class="modal-f"><span class="sp"></span><button class="btn btn-secondary" data-a="closeModal">Cancel</button><button class="btn btn-primary" data-a="saveMemberProfile">Save changes</button></div>`;
}

IN.memberProfileField = el => {
  if (S.ui.memberProfileDraft && ['name', 'title'].includes(el.dataset.field)) S.ui.memberProfileDraft[el.dataset.field] = el.value;
};
A.saveMemberProfile = () => {
  const modal = S.ui.modals.at(-1);
  const member = modal?.type === 'memberProfile' && mem(modal.id);
  if (S.ui.currentUser?.role !== 'admin' || !member || S.ui.memberProfileDraft?.id !== member.id) return;
  const name = document.getElementById('member-profile-name')?.value.trim();
  const title = document.getElementById('member-profile-title')?.value.trim() || '';
  if (!name) {
    S.ui.errors.memberProfile = true;
    render();
    document.getElementById('member-profile-name')?.focus();
    return;
  }
  if (!mutate(() => Object.assign(member, { name, title, profileEditedAt: Date.now() }))) return;
  S.ui.modals.pop();
  render();
  toast('Member profile updated');
};
