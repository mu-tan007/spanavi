import React, { useState } from 'react';
import { useAcqData } from './useAcqData';
import AcqDealsView from './AcqDealsView';
import AcqDealDetail from './AcqDealDetail';
import { AcqFirmsView, AcqFirmDetail } from './AcqFirmsView';
import { AcqContactsView, AcqContactDetail } from './AcqContactsView';

// 「買収」タブ（管理者のみ）。弊社が買い手として受けた売却案件・紹介元の会社・担当者を管理する。
//   currentTab: 'acq_deals' | 'acq_firms' | 'acq_contacts'
//   詳細はタブの中で開き、案件⇄会社⇄担当者を行き来できる。
export default function AcquisitionView({ currentTab, setCurrentTab }) {
  const data = useAcqData();
  const [openDeal, setOpenDeal] = useState(null);
  const [openFirm, setOpenFirm] = useState(null);
  const [openContact, setOpenContact] = useState(null);

  const goDeal = (id) => { setOpenDeal(id); setCurrentTab('acq_deals'); window.scrollTo?.(0, 0); };
  const goFirm = (id) => { setOpenFirm(id); setCurrentTab('acq_firms'); window.scrollTo?.(0, 0); };
  const goContact = (id) => { setOpenContact(id); setCurrentTab('acq_contacts'); window.scrollTo?.(0, 0); };
  const nav = { onOpenDeal: goDeal, onOpenFirm: goFirm, onOpenContact: goContact };

  if (currentTab === 'acq_firms') {
    return openFirm
      ? <AcqFirmDetail key={openFirm} firmId={openFirm} data={data} onBack={() => setOpenFirm(null)} {...nav} />
      : <AcqFirmsView data={data} onOpenFirm={goFirm} />;
  }
  if (currentTab === 'acq_contacts') {
    return openContact
      ? <AcqContactDetail key={openContact} contactId={openContact} data={data} onBack={() => setOpenContact(null)} {...nav} />
      : <AcqContactsView data={data} onOpenContact={goContact} />;
  }
  return openDeal
    ? <AcqDealDetail key={openDeal} dealId={openDeal} data={data} onBack={() => setOpenDeal(null)} {...nav} />
    : <AcqDealsView data={data} onOpenDeal={goDeal} />;
}
