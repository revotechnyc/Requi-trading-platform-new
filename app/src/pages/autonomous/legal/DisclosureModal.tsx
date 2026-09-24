import { useState, useCallback } from 'react';
import { AlertTriangle, Bot, Clock, TrendingUp, Building2, Mail, Scale, X, ChevronDown, ChevronUp } from 'lucide-react';
import { colors } from '../design';
import { legalColors, disclosureText, disclosureKeys } from './legalDesign';

const iconMap: Record<string, React.ReactNode> = {
  AlertTriangle: <AlertTriangle size={16} />,
  Bot: <Bot size={16} />,
  Clock: <Clock size={16} />,
  TrendingUp: <TrendingUp size={16} />,
  Building2: <Building2 size={16} />,
  Mail: <Mail size={16} />,
  Scale: <Scale size={16} />,
};

interface DisclosureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept: (acceptance: {
    allChecked: boolean;
    disclosures: Record<string, boolean>;
    firstTime: boolean;
    timestamp: number;
  }) => void;
  firstTime: boolean;
}

export default function DisclosureModal({ isOpen, onClose, onAccept, firstTime }: DisclosureModalProps) {
  const [checked, setChecked] = useState<Record<string, boolean>>({
    MATERIAL_RISK: false,
    AUTONOMOUS_TRADING: false,
    EXTENDED_HOURS: false,
    OPTIONS: false,
    BROKER_RELATIONSHIP: false,
    ELECTRONIC_COMMUNICATIONS: false,
    CONSTITUTION: false,
  });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [scrolled, setScrolled] = useState(false);
  const allChecked = Object.values(checked).every(Boolean);

  const toggleCheck = useCallback((key: string) => {
    setChecked(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const toggleExpand = useCallback((key: string) => {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleAccept = useCallback(() => {
    if (!allChecked) return;
    onAccept({
      allChecked,
      disclosures: checked,
      firstTime,
      timestamp: Date.now(),
    });
    // Reset for next time
    setChecked({
      MATERIAL_RISK: false,
      AUTONOMOUS_TRADING: false,
      EXTENDED_HOURS: false,
      OPTIONS: false,
      BROKER_RELATIONSHIP: false,
      ELECTRONIC_COMMUNICATIONS: false,
      CONSTITUTION: false,
    });
  }, [allChecked, checked, firstTime, onAccept]);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 5000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.75)',
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 720,
        maxHeight: '80vh',
        background: legalColors.bgLegalBody,
        borderRadius: 16,
        border: `1px solid ${legalColors.borderLegal}`,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: `1px solid ${legalColors.borderLegal}`,
          background: legalColors.bgLegalHeader,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <h2 style={{
              margin: 0, fontSize: 15, fontWeight: 700,
              color: legalColors.textLegalPrimary,
              letterSpacing: '0.02em',
            }}>
              {firstTime ? 'Required Disclosures — First Acceptance' : 'Re-confirm Disclosures'}
            </h2>
            <p style={{
              margin: '4px 0 0 0', fontSize: 11,
              color: legalColors.textLegalMuted,
            }}>
              {firstTime
                ? 'You must review and acknowledge all disclosures before accessing autonomous trading features.'
                : 'Please re-confirm your acknowledgment of the following disclosures.'}
            </p>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none',
            color: legalColors.textLegalMuted,
            cursor: 'pointer', padding: 4,
          }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            flex: 1, overflowY: 'auto',
            padding: '16px 24px',
          }}
          onScroll={(e) => {
            const el = e.currentTarget;
            setScrolled(el.scrollTop > 20);
          }}
        >
          {/* ESIGN reminder */}
          <div style={{
            padding: '10px 14px',
            background: legalColors.bgLegalHighlight,
            borderRadius: 8,
            marginBottom: 16,
            border: `1px solid rgba(245,197,66,0.15)`,
          }}>
            <p style={{ margin: 0, fontSize: 10, color: legalColors.textLegalWarning, lineHeight: 1.5 }}>
              These disclosures are provided electronically in accordance with the Electronic Signatures in Global and National Commerce Act (E-SIGN) and the Uniform Electronic Transactions Act (UETA). By checking each box, you are providing your electronic signature.
            </p>
          </div>

          {/* Disclosures */}
          {disclosureKeys.map((dk) => {
            const isChecked = checked[dk.key];
            const isExpanded = !!expanded[dk.key];
            const items = disclosureText[dk.key as keyof typeof disclosureText] || [];
            return (
              <div key={dk.key} style={{
                marginBottom: 12,
                border: `1px solid ${isChecked ? 'rgba(167,139,250,0.25)' : legalColors.borderLegal}`,
                borderRadius: 10,
                overflow: 'hidden',
                transition: 'border-color 0.2s',
              }}>
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '14px 16px',
                  background: isChecked ? 'rgba(167,139,250,0.06)' : 'transparent',
                  cursor: 'pointer',
                }} onClick={() => toggleCheck(dk.key)}>
                  <div style={{
                    width: 18, height: 18,
                    borderRadius: 4,
                    border: `2px solid ${isChecked ? colors.purple : legalColors.borderLegal}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: 1,
                    background: isChecked ? colors.purple : 'transparent',
                  }}>
                    {isChecked && (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M1 5.5L3.5 8L9 2" stroke={colors.textPrimary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: legalColors.textLegalMuted }}>{iconMap[dk.icon]}</span>
                      <span style={{
                        fontSize: 12, fontWeight: 600,
                        color: isChecked ? legalColors.textLegalPrimary : legalColors.textLegalMuted,
                      }}>
                        {dk.title}
                      </span>
                      <span style={{
                        fontSize: 9, fontWeight: 500,
                        padding: '1px 6px',
                        borderRadius: 4,
                        background: `${legalColors.textLegalWarning}15`,
                        color: legalColors.textLegalWarning,
                      }}>
                        REQUIRED
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleExpand(dk.key); }}
                    style={{
                      background: 'none', border: 'none',
                      color: legalColors.textLegalMuted,
                      cursor: 'pointer', padding: 2,
                    }}
                  >
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>

                {isExpanded && (
                  <div style={{
                    padding: '0 16px 16px 46px',
                    borderTop: `1px solid ${legalColors.borderLegal}`,
                    background: 'rgba(0,0,0,0.15)',
                  }}>
                    <ul style={{ margin: 0, padding: '12px 0 0 16px', color: legalColors.textLegalMuted, fontSize: 11, lineHeight: 1.7 }}>
                      {items.map((item, i) => (
                        <li key={i} style={{ marginBottom: 6 }}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}

          {/* Disclaimer */}
          <div style={{
            padding: '12px 16px',
            borderRadius: 8,
            background: 'rgba(255,255,255,0.03)',
            marginTop: 8,
          }}>
            <p style={{
              margin: 0, fontSize: 10,
              color: legalColors.textLegalDisclaimer,
              lineHeight: 1.6,
            }}>
              By checking each box above, you acknowledge that you have read and understood the corresponding disclosure.
              No investment advice is provided by this software. You are solely responsible for your trading decisions.
              All trading involves risk. You may lose more than your initial investment.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: `1px solid ${legalColors.borderLegal}`,
          background: legalColors.bgLegalHeader,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: allChecked ? colors.purple : legalColors.textLegalMuted,
            }} />
            <span style={{
              fontSize: 10, color: allChecked ? colors.purple : legalColors.textLegalMuted,
              fontWeight: 500,
            }}>
              {Object.values(checked).filter(Boolean).length} of 7 acknowledged
            </span>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
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
            <button
              onClick={handleAccept}
              disabled={!allChecked}
              style={{
                padding: '8px 24px',
                background: allChecked ? colors.purple : 'rgba(255,255,255,0.08)',
                border: 'none',
                borderRadius: 8,
                color: allChecked ? '#fff' : legalColors.textLegalMuted,
                fontSize: 12,
                fontWeight: 600,
                cursor: allChecked ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s',
              }}
            >
              {firstTime ? 'I Accept & Continue' : 'Confirm & Proceed'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
