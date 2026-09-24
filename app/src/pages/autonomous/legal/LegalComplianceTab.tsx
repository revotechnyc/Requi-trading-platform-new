import { useState, useEffect } from 'react';
import { FileText, CheckCircle, XCircle, Clock, AlertTriangle, Shield, RefreshCw, Download } from 'lucide-react';
import { colors } from '../design';
import { legalColors } from './legalDesign';

export default function LegalComplianceTab() {
  const [docs, setDocs] = useState<any[]>([]);
  const [acceptances, setAcceptances] = useState<any[]>([]);
  const [consents, setConsents] = useState<any[]>([]);
  const [complianceEvents, setComplianceEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulated fetch — in production, use trpc.autonomous.getLegalDocuments.useQuery
    setTimeout(() => {
      setDocs([
        { id: 1, documentId: 'MATERIAL_RISK_DISCLOSURE', title: 'Material Risk Disclosure', version: 1, isRequired: true, requiresReconsent: true },
        { id: 2, documentId: 'AUTONOMOUS_TRADING_DISCLOSURE', title: 'Autonomous Trading Disclosure', version: 1, isRequired: true, requiresReconsent: true },
        { id: 3, documentId: 'EXTENDED_HOURS_DISCLOSURE', title: 'Extended Hours Trading Disclosure', version: 1, isRequired: true, requiresReconsent: true },
        { id: 4, documentId: 'OPTIONS_RISK_DISCLOSURE', title: 'Options Risk Disclosure (ODD)', version: 1, isRequired: true, requiresReconsent: true },
        { id: 5, documentId: 'BROKER_RELATIONSHIP_CONSENT', title: 'Broker Relationship Consent', version: 1, isRequired: true, requiresReconsent: false },
        { id: 6, documentId: 'ELECTRONIC_COMMUNICATIONS_CONSENT', title: 'Electronic Communications Consent', version: 1, isRequired: true, requiresReconsent: false },
        { id: 7, documentId: 'CONSTITUTION_DISCLOSURE', title: 'Constitution Disclosure', version: 1, isRequired: true, requiresReconsent: true },
      ]);
      setAcceptances([
        { documentId: 1, documentVersion: 1, environment: 'PAPER', isFirstTime: true, createdAt: new Date().toISOString() },
        { documentId: 2, documentVersion: 1, environment: 'PAPER', isFirstTime: true, createdAt: new Date().toISOString() },
        { documentId: 3, documentVersion: 1, environment: 'PAPER', isFirstTime: true, createdAt: new Date().toISOString() },
      ]);
      setConsents([
        { consentType: 'E_SIGN', consentVersion: '1.0', isConsentGiven: true, consentTimestamp: new Date().toISOString() },
      ]);
      setComplianceEvents([
        { eventType: 'DOCUMENT_ACCEPTED', eventCategory: 'LEGAL', severity: 'INFO', createdAt: new Date().toISOString() },
        { eventType: 'AUTONOMOUS_START', eventCategory: 'OPERATIONAL', severity: 'INFO', createdAt: new Date().toISOString() },
      ]);
      setLoading(false);
    }, 400);
  }, []);

  const acceptedDocIds = new Set(acceptances.map(a => a.documentId));

  const Section = ({ title, children, icon: Icon }: { title: string; children: React.ReactNode; icon: any }) => (
    <div style={{
      background: colors.bgPanel,
      borderRadius: 12,
      border: `1px solid ${colors.border}`,
      marginBottom: 16,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '14px 18px',
        borderBottom: `1px solid ${colors.border}`,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <Icon size={14} color={colors.purple} />
        <span style={{ fontSize: 12, fontWeight: 600, color: colors.textPrimary }}>{title}</span>
      </div>
      <div style={{ padding: '14px 18px' }}>
        {children}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
        <RefreshCw size={20} color={colors.purple} className="spin" />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } } .spin { animation: spin 1s linear infinite; }`}</style>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px 0' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        marginBottom: 20,
        padding: '14px 18px',
        background: colors.bgPanel,
        borderRadius: 12,
        border: `1px solid ${colors.border}`,
      }}>
        <Shield size={18} color={colors.purple} />
        <div>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: colors.textPrimary }}>
            Legal & Compliance
          </h3>
          <p style={{ margin: '2px 0 0 0', fontSize: 10, color: colors.textMuted }}>
            Manage your legal acceptances, electronic consent, and compliance history.
          </p>
        </div>
      </div>

      <Section title="Required Disclosures" icon={FileText}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {docs.map((doc) => {
            const accepted = acceptedDocIds.has(doc.id);
            return (
              <div key={doc.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px',
                borderRadius: 8,
                background: accepted ? 'rgba(34,197,94,0.04)' : 'rgba(239,68,68,0.04)',
                border: `1px solid ${accepted ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)'}`,
              }}>
                {accepted ? (
                  <CheckCircle size={14} color={colors.green} />
                ) : (
                  <XCircle size={14} color={colors.red} />
                )}
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 500, color: colors.textPrimary }}>
                    {doc.title}
                  </p>
                  <p style={{ margin: '2px 0 0 0', fontSize: 9, color: colors.textMuted }}>
                    v{doc.version} {doc.requiresReconsent && <span style={{ color: colors.orange }}>Re-consent required every {doc.reconsentIntervalMonths} months</span>}
                  </p>
                </div>
                <span style={{
                  fontSize: 9, fontWeight: 500,
                  padding: '2px 8px',
                  borderRadius: 4,
                  background: accepted ? `${colors.green}12` : `${colors.red}12`,
                  color: accepted ? colors.green : colors.red,
                }}>
                  {accepted ? 'ACCEPTED' : 'PENDING'}
                </span>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Electronic Consent" icon={Clock}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {consents.map((c, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px',
              borderRadius: 8,
              background: colors.bgElevated,
            }}>
              <CheckCircle size={14} color={colors.green} />
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 11, color: colors.textPrimary, fontWeight: 500 }}>
                  {c.consentType === 'E_SIGN' ? 'E-SIGN / UETA Consent' : c.consentType}
                </p>
                <p style={{ margin: '2px 0 0 0', fontSize: 9, color: colors.textMuted }}>
                  Version {c.consentVersion} — {new Date(c.consentTimestamp).toLocaleDateString()}
                </p>
              </div>
              <span style={{ fontSize: 9, color: colors.green, fontWeight: 500 }}>ACTIVE</span>
            </div>
          ))}
          {consents.length === 0 && (
            <div style={{
              padding: '12px',
              borderRadius: 8,
              background: 'rgba(239,68,68,0.04)',
              border: `1px solid rgba(239,68,68,0.12)`,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <AlertTriangle size={14} color={colors.red} />
              <span style={{ fontSize: 11, color: colors.red }}>
                No electronic consent on file. Autonomous trading is disabled.
              </span>
            </div>
          )}
        </div>
      </Section>

      <Section title="Compliance Event Log" icon={Shield}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {complianceEvents.map((ev, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px',
              borderRadius: 6,
              background: colors.bgElevated,
            }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: ev.severity === 'INFO' ? colors.green : ev.severity === 'WARNING' ? colors.orange : colors.red,
              }} />
              <span style={{ fontSize: 10, color: colors.textMuted, fontFamily: 'JetBrains Mono, monospace' }}>
                {new Date(ev.createdAt).toLocaleString()}
              </span>
              <span style={{ fontSize: 10, color: colors.textPrimary, fontWeight: 500 }}>{ev.eventType}</span>
              <span style={{
                fontSize: 9, padding: '1px 6px',
                borderRadius: 4,
                background: `${colors.blue}12`,
                color: colors.blue,
              }}>
                {ev.eventCategory}
              </span>
              <span style={{
                fontSize: 9, padding: '1px 6px',
                borderRadius: 4,
                background: ev.severity === 'INFO' ? `${colors.green}12` : ev.severity === 'WARNING' ? `${colors.orange}12` : `${colors.red}12`,
                color: ev.severity === 'INFO' ? colors.green : ev.severity === 'WARNING' ? colors.orange : colors.red,
              }}>
                {ev.severity}
              </span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
          <button style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 14px',
            background: 'none',
            border: `1px solid ${colors.border}`,
            borderRadius: 6,
            color: colors.textMuted,
            fontSize: 10,
            cursor: 'pointer',
          }}>
            <Download size={12} />
            Export Compliance Report
          </button>
        </div>
      </Section>

      <Section title="Withdrawal & Revocation" icon={AlertTriangle}>
        <div style={{
          padding: '14px',
          borderRadius: 8,
          background: 'rgba(239,68,68,0.04)',
          border: `1px solid rgba(239,68,68,0.12)`,
        }}>
          <p style={{ margin: '0 0 8px 0', fontSize: 11, color: colors.textPrimary, fontWeight: 500 }}>
            <AlertTriangle size={12} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
            Withdrawing Consent
          </p>
          <p style={{ margin: '0 0 12px 0', fontSize: 10, color: colors.textMuted, lineHeight: 1.6 }}>
            You may withdraw your consent to electronic communications or autonomous trading authorization at any time.
            Withdrawal does not affect the validity of actions taken before withdrawal.
            Contact support to initiate a withdrawal.
          </p>
          <button style={{
            padding: '6px 14px',
            background: 'rgba(239,68,68,0.1)',
            border: `1px solid rgba(239,68,68,0.2)`,
            borderRadius: 6,
            color: colors.red,
            fontSize: 11,
            fontWeight: 500,
            cursor: 'pointer',
          }}>
            Request Withdrawal
          </button>
        </div>
      </Section>
    </div>
  );
}
