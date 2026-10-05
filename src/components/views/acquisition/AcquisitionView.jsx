import React, { useState } from 'react';
import { useAcqData } from './useAcqData';
import AcqDealsView from './AcqDealsView';
import AcqDealDetail from './AcqDealDetail';
import { AcqFirmsView, AcqFirmDetail } from './AcqFirmsView';
import { AcqContactDetail } from './AcqContactsView';

// 「買収」タブ（管理者のみ）。弊社が買い手として受けた売却案件・紹介元の会社・担当者を管理する。
//   currentTab: 'acq_deals' | 'acq_firms'（担当者は会社ごとにまとめ、会社のページから開く）
//   詳細はタブの中で開き、案件⇄会社⇄担当者を行き来できる。
export default function AcquisitionView({ currentTab, setCurrentTab }) {
  const data = useAcqData();
  const [openDeal, setOpenDeal] = useState(null);
  const [openFirm, setOpenFirm] = useState(null);
  const [openContact, setOpenContact] = useState(null);

  const goDeal = (id) => { setOpenDeal(id); setCurrentTab('acq_deals'); window.scrollTo?.(0, 0); };
  const goFirm = (id) => { setOpenFirm(id); setCurrentTab('acq_firms'); window.scrollTo?.(0, 0); };
  const goContact = (id) => { setOpenContact(id); setCurrentTab('acq_firms'); window.scrollTo?.(0, 0); };
  const nav = { onOpenDeal: goDeal, onOpenFirm: goFirm, onOpenContact: goContact };

  if (currentTab === 'acq_firms' || currentTab === 'acq_contacts') {
    if (openContact) {
      return <AcqContactDetail key={openContact} contactId={openContact} data={data} onBack={() => setOpenContact(null)} {...nav} onOpenFirm={(id) => { setOpenContact(null); goFirm(id); }} />;
    }
    return openFirm
      ? <AcqFirmDetail key={openFirm} firmId={openFirm} data={data} onBack={() => setOpenFirm(null)} {...nav} />
      : <AcqFirmsView data={data} onOpenFirm={goFirm} onOpenContact={goContact} />;
  }
  return openDeal
    ? <AcqDealDetail key={openDeal} dealId={openDeal} data={data} onBack={() => setOpenDeal(null)} {...nav} />
    : <AcqDealsView data={data} onOpenDeal={goDeal} />;
}
