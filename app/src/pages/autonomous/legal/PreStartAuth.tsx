import { useState } from 'react';
import { Shield, AlertTriangle, CheckCircle, XCircle, Lock, FileText, Building2, Wifi } from 'lucide-react';
import { colors } from '../design';
import { legalColors } from './legalDesign';

interface PreStartAuthProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  gateStatus: {
    eligible: boolean;
    pendingDocuments: number;
    pendingReconsents: number;
    hasBrokerAuthorization: boolean;
    hasElectronicConsent: boolean;
    gateFailedReasons: string[];
  };
  environment: string;
}

const reasonMap: Record<string, { label: string; desc: string }> = {
  PENDING_LEGAL_DOCUMENTS: {
    label: 'Pending Legal Documents',
    desc: 'You have not accepted all required legal disclosures.',
  },
  PENDING_RECONSENT: {
    label: 'Re-consent Required',
    desc: 'One or more disclosures require renewal.',
  },
  MISSING_BROKER_AUTH: {
    label: 'Missing Broker Authorization',
    desc: 'You have not authorized a broker for this account.',
  },
  MISSING_ELECTRONIC_CONSENT: {
    label: 'Missing Electronic Consent',
    desc: 'You have not consented to electronic communications (E-SIGN).',
  },
};

export default function PreStartAuth({ isOpen, onClose, onConfirm, gateStatus, environment }: PreStartAuthProps) {
  const [confirmText, setConfirmText] = useState('');
  const confirmed = confirmText.trim().toUpperCase() === 'START';

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 6000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.8)',
      backdropFilter: 'blur(6px)',
    }}>
      <div style={{
        width: '100%', maxWidth: 520,
        background: legalColors.bgLegalBody,
        borderRadius: 16,
        border: `1px solid ${legalColors.borderLegal}`,
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '20px 24px',
          background: legalColors.bgLegalHeader,
          borderBottom: `1px solid ${legalColors.borderLegal}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Shield size={18} color={gateStatus.eligible ? colors.purple : legalColors.textLegalWarning} />
            <h2 style={{
              margin: 0, fontSize: 15, fontWeight: 700,
              color: legalColors.textLegalPrimary,
            }}>
              Pre-Start Authorization
            </h2>
          </div>
          <p style={{
            margin: '6px 0 0 0', fontSize: 11,
            color: legalColors.textLegalMuted,
          }}>
            Environment: <span style={{ color: colors.textPrimary, fontWeight: 600 }}>{environment}</span>
          </p>
        </div>

        <div style={{ padding: '20px 24px' }}>
          {/* Gate status */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '12px 16px',
            borderRadius: 10,
            background: gateStatus.eligible ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
            border: `1px solid ${gateStatus.eligible ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
            marginBottom: 20,
          }}>
            {gateStatus.eligible ? (
              <CheckCircle size={18} color={colors.green} />
            ) : (
              <XCircle size={18} color={colors.red} />
            )}
            <div>
              <p style={{
                margin: 0, fontSize: 12, fontWeight: 600,
                color: gateStatus.eligible ? colors.green : colors.red,
              }}>
                {gateStatus.eligible ? 'All gates passed — Ready to start' : 'Start blocked — Gates failed'}
              </p>
              <p style={{ margin: '2px 0 0 0', fontSize: 10, color: legalColors.textLegalMuted }}>
                {gateStatus.gateFailedReasons.length} gate{gateStatus.gateFailedReasons.length !== 1 ? 's' : ''} failed
              </p>
            </div>
          </div>

          {/* Checklist */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            <GateItem
              icon={<FileText size={14} />}
              label="Legal Documents"
              status={gateStatus.pendingDocuments === 0 ? 'pass' : 'fail'}
              detail={gateStatus.pendingDocuments > 0 ? `${gateStatus.pendingDocuments} pending` : 'All accepted'}
            />
            <GateItem
              icon={<Lock size={14} />}
              label="Re-consent Queue"
              status={gateStatus.pendingReconsents === 0 ? 'pass' : 'fail'}
              detail={gateStatus.pendingReconsents > 0 ? `${gateStatus.pendingReconsents} pending` : 'None required'}
            />
            <GateItem
              icon={<Building2 size={14} />}
              label="Broker Authorization"
              status={gateStatus.hasBrokerAuthorization ? 'pass' : 'fail'}
              detail={gateStatus.hasBrokerAuthorization ? 'Authorized' : 'Not authorized'}
            />
            <GateItem
              icon={<Wifi size={14} />}
              label="Electronic Consent (E-SIGN)"
              status={gateStatus.hasElectronicConsent ? 'pass' : 'fail'}
              detail={gateStatus.hasElectronicConsent ? 'Consented' : 'Not consented'}
            />
          </div>

          {/* Failure reasons */}
          {!gateStatus.eligible && gateStatus.gateFailedReasons.length > 0 && (
            <div style={{
              padding: '14px 16px',
              borderRadius: 10,
              background: 'rgba(239,68,68,0.05)',
              border: `1px solid rgba(239,68,68,0.15)`,
              marginBottom: 20,
            }}>
              <p style={{
                margin: '0 0 8px 0', fontSize: 11, fontWeight: 600,
                color: colors.red,
              }}>
                <AlertTriangle size={12} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
                Failed Requirements
              </p>
              {gateStatus.gateFailedReasons.map((reason) => {
                const r = reasonMap[reason] || { label: reason, desc: '' };
                return (
                  <div key={reason} style={{ marginBottom: 8 }}>
                    <p style={{ margin: 0, fontSize: 11, color: colors.textPrimary, fontWeight: 500 }}>{r.label}</p>
                    <p style={{ margin: '2px 0 0 0', fontSize: 10, color: legalColors.textLegalMuted }}>{r.desc}</p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Confirm text input */}
          {gateStatus.eligible && (
            <div style={{ marginBottom: 16 }}>
              <p style={{
                margin: '0 0 8px 0', fontSize: 11,
                color: legalColors.textLegalMuted,
              }}>
                Type <strong style={{ color: colors.textPrimary }}>START</strong> to authorize autonomous trading:
              </p>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Type START to confirm"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: colors.bgElevated,
                  border: `1px solid ${confirmed ? 'rgba(167,139,250,0.3)' : colors.border}`,
                  borderRadius: 8,
                  color: colors.textPrimary,
                  fontSize: 13,
                  fontFamily: 'JetBrains Mono, monospace',
                  outline: 'none',
                }}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: `1px solid ${legalColors.borderLegal}`,
          background: legalColors.bgLegalHeader,
          display: 'flex', justifyContent: 'flex-end', gap: 10,
        }}>
          <button onClick={onClose} style={{
            padding: '8px 18px',
            background: 'none',
            border: `1px solid ${legalColors.borderLegal}`,
            borderRadius: 8,
            color: legalColors.textLegalMuted,
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
          }}>
            Cancel
          </button>
          {gateStatus.eligible && (
            <button
              onClick={onConfirm}
              disabled={!confirmed}
              style={{
                padding: '8px 24px',
                background: confirmed ? colors.purple : 'rgba(255,255,255,0.08)',
                border: 'none',
                borderRadius: 8,
                color: confirmed ? '#fff' : legalColors.textLegalMuted,
                fontSize: 12,
                fontWeight: 600,
                cursor: confirmed ? 'pointer' : 'not-allowed',
              }}
            >
              Authorize & Start
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function GateItem({ icon, label, status, detail }: {
  icon: React.ReactNode;
  label: string;
  status: 'pass' | 'fail';
  detail: string;
}) {
  const passColor = '#22C55E';
  const failColor = '#EF4444';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 14px',
      borderRadius: 8,
      background: 'rgba(255,255,255,0.02)',
    }}>
      <span style={{ color: status === 'pass' ? passColor : failColor }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <p style={{ margin: 0, fontSize: 11, color: legalColors.textLegalPrimary, fontWeight: 500 }}>{label}</p>
      </div>
      <span style={{
        fontSize: 10, fontWeight: 500,
        color: status === 'pass' ? passColor : failColor,
      }}>
        {detail}
      </span>
    </div>
  );
}
