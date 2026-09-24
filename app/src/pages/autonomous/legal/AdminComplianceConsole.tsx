import { useState, useEffect } from 'react';
import { Shield, Users, FileCheck, AlertTriangle, Download, Search, Filter } from 'lucide-react';
import { colors } from '../design';

export default function AdminComplianceConsole() {
  const [events, setEvents] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  useEffect(() => {
    // Simulated admin data
    setTimeout(() => {
      setEvents([
        { id: 1, userId: 1, eventType: 'DOCUMENT_ACCEPTED', eventCategory: 'LEGAL', severity: 'INFO', createdAt: new Date(Date.now() - 86400000).toISOString(), details: { documentVersion: 1 } },
        { id: 2, userId: 1, eventType: 'AUTONOMOUS_START', eventCategory: 'OPERATIONAL', severity: 'INFO', createdAt: new Date(Date.now() - 7200000).toISOString(), details: { gateStatus: 'ALL_PASSED' } },
        { id: 3, userId: 2, eventType: 'BROKER_AUTH_REVOKED', eventCategory: 'LEGAL', severity: 'WARNING', createdAt: new Date(Date.now() - 3600000).toISOString(), details: {} },
      ]);
      setUsers([
        { id: 1, name: 'Alice Trader', docsAccepted: 7, esign: true, brokerAuth: true, lastStart: new Date(Date.now() - 7200000).toISOString() },
        { id: 2, name: 'Bob Analyst', docsAccepted: 5, esign: true, brokerAuth: false, lastStart: null },
      ]);
    }, 300);
  }, []);

  const filteredEvents = events.filter(ev => {
    if (filter !== 'ALL' && ev.severity !== filter) return false;
    if (search && !ev.eventType.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div style={{ padding: '16px 0' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Shield size={18} color={colors.purple} />
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: colors.textPrimary }}>
            Compliance Console
          </h3>
        </div>
        <button style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 14px',
          background: colors.bgElevated,
          border: `1px solid ${colors.border}`,
          borderRadius: 8,
          color: colors.textMuted,
          fontSize: 11,
          cursor: 'pointer',
        }}>
          <Download size={12} />
          Export Audit Log
        </button>
      </div>

      {/* Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 12,
        marginBottom: 20,
      }}>
        <StatCard icon={Users} label="Active Users" value={users.length} color={colors.blue} />
        <StatCard icon={FileCheck} label="Fully Compliant" value={users.filter(u => u.docsAccepted === 7 && u.esign && u.brokerAuth).length} color={colors.green} />
        <StatCard icon={AlertTriangle} label="Warnings (24h)" value={events.filter(e => e.severity === 'WARNING').length} color={colors.orange} />
        <StatCard icon={Shield} label="Start Events (24h)" value={events.filter(e => e.eventType === 'AUTONOMOUS_START').length} color={colors.purple} />
      </div>

      {/* User compliance table */}
      <div style={{
        background: colors.bgPanel,
        borderRadius: 12,
        border: `1px solid ${colors.border}`,
        marginBottom: 20,
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '14px 18px',
          borderBottom: `1px solid ${colors.border}`,
          fontSize: 12, fontWeight: 600, color: colors.textPrimary,
        }}>
          User Compliance Status
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                {['User', 'Disclosures', 'E-SIGN', 'Broker Auth', 'Last Start', 'Status'].map(h => (
                  <th key={h} style={{
                    padding: '10px 14px', textAlign: 'left',
                    color: colors.textMuted, fontWeight: 500,
                    fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const compliant = u.docsAccepted === 7 && u.esign && u.brokerAuth;
                return (
                  <tr key={u.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                    <td style={{ padding: '10px 14px', color: colors.textPrimary, fontWeight: 500 }}>{u.name}</td>
                    <td style={{ padding: '10px 14px', color: u.docsAccepted === 7 ? colors.green : colors.orange }}>
                      {u.docsAccepted}/7
                    </td>
                    <td style={{ padding: '10px 14px', color: u.esign ? colors.green : colors.red }}>
                      {u.esign ? 'Yes' : 'No'}
                    </td>
                    <td style={{ padding: '10px 14px', color: u.brokerAuth ? colors.green : colors.red }}>
                      {u.brokerAuth ? 'Yes' : 'No'}
                    </td>
                    <td style={{ padding: '10px 14px', color: colors.textMuted, fontFamily: 'JetBrains Mono, monospace', fontSize: 10 }}>
                      {u.lastStart ? new Date(u.lastStart).toLocaleString() : '—'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{
                        fontSize: 9, fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: compliant ? `${colors.green}12` : `${colors.red}12`,
                        color: compliant ? colors.green : colors.red,
                      }}>
                        {compliant ? 'COMPLIANT' : 'BLOCKED'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Event log with filters */}
      <div style={{
        background: colors.bgPanel,
        borderRadius: 12,
        border: `1px solid ${colors.border}`,
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '14px 18px',
          borderBottom: `1px solid ${colors.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
        }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: colors.textPrimary }}>
            Compliance Events
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 10px',
              background: colors.bgElevated,
              borderRadius: 6,
              border: `1px solid ${colors.border}`,
            }}>
              <Search size={12} color={colors.textMuted} />
              <input
                type="text"
                placeholder="Search events..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  background: 'none', border: 'none',
                  color: colors.textPrimary,
                  fontSize: 11,
                  outline: 'none',
                  width: 120,
                }}
              />
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 10px',
              background: colors.bgElevated,
              borderRadius: 6,
              border: `1px solid ${colors.border}`,
            }}>
              <Filter size={12} color={colors.textMuted} />
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                style={{
                  background: 'none', border: 'none',
                  color: colors.textPrimary,
                  fontSize: 11,
                  outline: 'none',
                }}
              >
                <option value="ALL">All</option>
                <option value="INFO">Info</option>
                <option value="WARNING">Warning</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
          </div>
        </div>
        <div style={{ padding: '8px 0' }}>
          {filteredEvents.map(ev => (
            <div key={ev.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 18px',
              borderBottom: `1px solid ${colors.border}`,
            }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: ev.severity === 'INFO' ? colors.green : ev.severity === 'WARNING' ? colors.orange : colors.red,
              }} />
              <span style={{
                fontSize: 10, fontFamily: 'JetBrains Mono, monospace',
                color: colors.textMuted,
                minWidth: 130,
              }}>
                {new Date(ev.createdAt).toLocaleString()}
              </span>
              <span style={{
                fontSize: 10, fontWeight: 500,
                color: colors.textPrimary,
                minWidth: 180,
              }}>
                {ev.eventType}
              </span>
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
          {filteredEvents.length === 0 && (
            <div style={{
              padding: '20px',
              textAlign: 'center',
              color: colors.textMuted,
              fontSize: 11,
            }}>
              No events match your filters.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: {
  icon: any; label: string; value: number; color: string;
}) {
  return (
    <div style={{
      background: colors.bgPanel,
      borderRadius: 12,
      border: `1px solid ${colors.border}`,
      padding: '16px 18px',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon size={14} color={color} />
        <span style={{ fontSize: 10, color: colors.textMuted, fontWeight: 500 }}>{label}</span>
      </div>
      <span style={{ fontSize: 22, fontWeight: 700, color }}>{value}</span>
    </div>
  );
}
