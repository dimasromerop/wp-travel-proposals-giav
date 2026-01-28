import { useEffect, useMemo, useRef, useState } from '@wordpress/element';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  ComboboxControl,
  DatePicker,
  Notice,
  Popover,
  Spinner,
  TextControl,
  SelectControl,
} from '@wordpress/components';
import API from '../../api';
import { buildCustomerFullName, splitCustomerFullName } from '../../utils/customer';

const LANG_OPTIONS = [
  { label: 'Español', value: 'es_ES' },
  { label: 'English (US)', value: 'en_US' },
];

const CURRENCY_OPTIONS = [
  { label: 'EUR', value: 'EUR' },
  { label: 'USD', value: 'USD' },
  { label: 'GBP', value: 'GBP' },
];

const COUNTRY_OPTIONS = [
  { value: 'AF', label: 'Afghanistan (AF)' },
  { value: 'AL', label: 'Albania (AL)' },
  { value: 'DZ', label: 'Algeria (DZ)' },
  { value: 'AS', label: 'American Samoa (AS)' },
  { value: 'AD', label: 'Andorra (AD)' },
  { value: 'AO', label: 'Angola (AO)' },
  { value: 'AI', label: 'Anguilla (AI)' },
  { value: 'AQ', label: 'Antarctica (AQ)' },
  { value: 'AG', label: 'Antigua and Barbuda (AG)' },
  { value: 'AR', label: 'Argentina (AR)' },
  { value: 'AM', label: 'Armenia (AM)' },
  { value: 'AW', label: 'Aruba (AW)' },
  { value: 'AU', label: 'Australia (AU)' },
  { value: 'AT', label: 'Austria (AT)' },
  { value: 'AZ', label: 'Azerbaijan (AZ)' },
  { value: 'BS', label: 'Bahamas (BS)' },
  { value: 'BH', label: 'Bahrain (BH)' },
  { value: 'BD', label: 'Bangladesh (BD)' },
  { value: 'BB', label: 'Barbados (BB)' },
  { value: 'BY', label: 'Belarus (BY)' },
  { value: 'BE', label: 'Belgium (BE)' },
  { value: 'BZ', label: 'Belize (BZ)' },
  { value: 'BJ', label: 'Benin (BJ)' },
  { value: 'BM', label: 'Bermuda (BM)' },
  { value: 'BT', label: 'Bhutan (BT)' },
  { value: 'BO', label: 'Bolivia (BO)' },
  { value: 'BQ', label: 'Bonaire, Sint Eustatius and Saba (BQ)' },
  { value: 'BA', label: 'Bosnia and Herzegovina (BA)' },
  { value: 'BW', label: 'Botswana (BW)' },
  { value: 'BV', label: 'Bouvet Island (BV)' },
  { value: 'BR', label: 'Brazil (BR)' },
  { value: 'IO', label: 'British Indian Ocean Territory (IO)' },
  { value: 'BN', label: 'Brunei (BN)' },
  { value: 'BG', label: 'Bulgaria (BG)' },
  { value: 'BF', label: 'Burkina Faso (BF)' },
  { value: 'BI', label: 'Burundi (BI)' },
  { value: 'KH', label: 'Cambodia (KH)' },
  { value: 'CM', label: 'Cameroon (CM)' },
  { value: 'CA', label: 'Canada (CA)' },
  { value: 'CV', label: 'Cape Verde (CV)' },
  { value: 'KY', label: 'Cayman Islands (KY)' },
  { value: 'CF', label: 'Central African Republic (CF)' },
  { value: 'TD', label: 'Chad (TD)' },
  { value: 'CL', label: 'Chile (CL)' },
  { value: 'CN', label: 'China (CN)' },
  { value: 'CX', label: 'Christmas Island (CX)' },
  { value: 'CC', label: 'Cocos (Keeling) Islands (CC)' },
  { value: 'CO', label: 'Colombia (CO)' },
  { value: 'KM', label: 'Comoros (KM)' },
  { value: 'CG', label: 'Congo (CG)' },
  { value: 'CD', label: 'Congo (Democratic Republic) (CD)' },
  { value: 'CK', label: 'Cook Islands (CK)' },
  { value: 'CR', label: 'Costa Rica (CR)' },
  { value: 'CI', label: 'Côte d’Ivoire (CI)' },
  { value: 'HR', label: 'Croatia (HR)' },
  { value: 'CU', label: 'Cuba (CU)' },
  { value: 'CW', label: 'Curaçao (CW)' },
  { value: 'CY', label: 'Cyprus (CY)' },
  { value: 'CZ', label: 'Czechia (CZ)' },
  { value: 'DK', label: 'Denmark (DK)' },
  { value: 'DJ', label: 'Djibouti (DJ)' },
  { value: 'DM', label: 'Dominica (DM)' },
  { value: 'DO', label: 'Dominican Republic (DO)' },
  { value: 'EC', label: 'Ecuador (EC)' },
  { value: 'EG', label: 'Egypt (EG)' },
  { value: 'SV', label: 'El Salvador (SV)' },
  { value: 'GQ', label: 'Equatorial Guinea (GQ)' },
  { value: 'ER', label: 'Eritrea (ER)' },
  { value: 'EE', label: 'Estonia (EE)' },
  { value: 'ET', label: 'Ethiopia (ET)' },
  { value: 'FK', label: 'Falkland Islands (FK)' },
  { value: 'FO', label: 'Faroe Islands (FO)' },
  { value: 'FJ', label: 'Fiji (FJ)' },
  { value: 'FI', label: 'Finland (FI)' },
  { value: 'FR', label: 'France (FR)' },
  { value: 'GF', label: 'French Guiana (GF)' },
  { value: 'PF', label: 'French Polynesia (PF)' },
  { value: 'TF', label: 'French Southern Territories (TF)' },
  { value: 'GA', label: 'Gabon (GA)' },
  { value: 'GM', label: 'Gambia (GM)' },
  { value: 'GE', label: 'Georgia (GE)' },
  { value: 'DE', label: 'Germany (DE)' },
  { value: 'GH', label: 'Ghana (GH)' },
  { value: 'GI', label: 'Gibraltar (GI)' },
  { value: 'GR', label: 'Greece (GR)' },
  { value: 'GL', label: 'Greenland (GL)' },
  { value: 'GD', label: 'Grenada (GD)' },
  { value: 'GP', label: 'Guadeloupe (GP)' },
  { value: 'GU', label: 'Guam (GU)' },
  { value: 'GT', label: 'Guatemala (GT)' },
  { value: 'GG', label: 'Guernsey (GG)' },
  { value: 'GN', label: 'Guinea (GN)' },
  { value: 'GW', label: 'Guinea-Bissau (GW)' },
  { value: 'GY', label: 'Guyana (GY)' },
  { value: 'HT', label: 'Haiti (HT)' },
  { value: 'HM', label: 'Heard Island and McDonald Islands (HM)' },
  { value: 'HN', label: 'Honduras (HN)' },
  { value: 'HK', label: 'Hong Kong (HK)' },
  { value: 'HU', label: 'Hungary (HU)' },
  { value: 'IS', label: 'Iceland (IS)' },
  { value: 'IN', label: 'India (IN)' },
  { value: 'ID', label: 'Indonesia (ID)' },
  { value: 'IR', label: 'Iran (IR)' },
  { value: 'IQ', label: 'Iraq (IQ)' },
  { value: 'IE', label: 'Ireland (IE)' },
  { value: 'IM', label: 'Isle of Man (IM)' },
  { value: 'IL', label: 'Israel (IL)' },
  { value: 'IT', label: 'Italy (IT)' },
  { value: 'JM', label: 'Jamaica (JM)' },
  { value: 'JP', label: 'Japan (JP)' },
  { value: 'JE', label: 'Jersey (JE)' },
  { value: 'JO', label: 'Jordan (JO)' },
  { value: 'KZ', label: 'Kazakhstan (KZ)' },
  { value: 'KE', label: 'Kenya (KE)' },
  { value: 'KI', label: 'Kiribati (KI)' },
  { value: 'KP', label: 'Korea (North) (KP)' },
  { value: 'KR', label: 'Korea (South) (KR)' },
  { value: 'KW', label: 'Kuwait (KW)' },
  { value: 'KG', label: 'Kyrgyzstan (KG)' },
  { value: 'LA', label: 'Laos (LA)' },
  { value: 'LV', label: 'Latvia (LV)' },
  { value: 'LB', label: 'Lebanon (LB)' },
  { value: 'LS', label: 'Lesotho (LS)' },
  { value: 'LR', label: 'Liberia (LR)' },
  { value: 'LY', label: 'Libya (LY)' },
  { value: 'LI', label: 'Liechtenstein (LI)' },
  { value: 'LT', label: 'Lithuania (LT)' },
  { value: 'LU', label: 'Luxembourg (LU)' },
  { value: 'MO', label: 'Macao (MO)' },
  { value: 'MG', label: 'Madagascar (MG)' },
  { value: 'MW', label: 'Malawi (MW)' },
  { value: 'MY', label: 'Malaysia (MY)' },
  { value: 'MV', label: 'Maldives (MV)' },
  { value: 'ML', label: 'Mali (ML)' },
  { value: 'MT', label: 'Malta (MT)' },
  { value: 'MH', label: 'Marshall Islands (MH)' },
  { value: 'MQ', label: 'Martinique (MQ)' },
  { value: 'MR', label: 'Mauritania (MR)' },
  { value: 'MU', label: 'Mauritius (MU)' },
  { value: 'YT', label: 'Mayotte (YT)' },
  { value: 'MX', label: 'Mexico (MX)' },
  { value: 'FM', label: 'Micronesia (FM)' },
  { value: 'MD', label: 'Moldova (MD)' },
  { value: 'MC', label: 'Monaco (MC)' },
  { value: 'MN', label: 'Mongolia (MN)' },
  { value: 'ME', label: 'Montenegro (ME)' },
  { value: 'MS', label: 'Montserrat (MS)' },
  { value: 'MA', label: 'Morocco (MA)' },
  { value: 'MZ', label: 'Mozambique (MZ)' },
  { value: 'MM', label: 'Myanmar (MM)' },
  { value: 'NA', label: 'Namibia (NA)' },
  { value: 'NR', label: 'Nauru (NR)' },
  { value: 'NP', label: 'Nepal (NP)' },
  { value: 'NL', label: 'Netherlands (NL)' },
  { value: 'NC', label: 'New Caledonia (NC)' },
  { value: 'NZ', label: 'New Zealand (NZ)' },
  { value: 'NI', label: 'Nicaragua (NI)' },
  { value: 'NE', label: 'Niger (NE)' },
  { value: 'NG', label: 'Nigeria (NG)' },
  { value: 'NU', label: 'Niue (NU)' },
  { value: 'NF', label: 'Norfolk Island (NF)' },
  { value: 'MK', label: 'North Macedonia (MK)' },
  { value: 'MP', label: 'Northern Mariana Islands (MP)' },
  { value: 'NO', label: 'Norway (NO)' },
  { value: 'OM', label: 'Oman (OM)' },
  { value: 'PK', label: 'Pakistan (PK)' },
  { value: 'PW', label: 'Palau (PW)' },
  { value: 'PS', label: 'Palestine (PS)' },
  { value: 'PA', label: 'Panama (PA)' },
  { value: 'PG', label: 'Papua New Guinea (PG)' },
  { value: 'PY', label: 'Paraguay (PY)' },
  { value: 'PE', label: 'Peru (PE)' },
  { value: 'PH', label: 'Philippines (PH)' },
  { value: 'PN', label: 'Pitcairn (PN)' },
  { value: 'PL', label: 'Poland (PL)' },
  { value: 'PT', label: 'Portugal (PT)' },
  { value: 'PR', label: 'Puerto Rico (PR)' },
  { value: 'QA', label: 'Qatar (QA)' },
  { value: 'RE', label: 'Réunion (RE)' },
  { value: 'RO', label: 'Romania (RO)' },
  { value: 'RU', label: 'Russia (RU)' },
  { value: 'RW', label: 'Rwanda (RW)' },
  { value: 'BL', label: 'Saint Barthélemy (BL)' },
  { value: 'SH', label: 'Saint Helena (SH)' },
  { value: 'KN', label: 'Saint Kitts and Nevis (KN)' },
  { value: 'LC', label: 'Saint Lucia (LC)' },
  { value: 'MF', label: 'Saint Martin (MF)' },
  { value: 'PM', label: 'Saint Pierre and Miquelon (PM)' },
  { value: 'VC', label: 'Saint Vincent and the Grenadines (VC)' },
  { value: 'WS', label: 'Samoa (WS)' },
  { value: 'SM', label: 'San Marino (SM)' },
  { value: 'ST', label: 'São Tomé and Príncipe (ST)' },
  { value: 'SA', label: 'Saudi Arabia (SA)' },
  { value: 'SN', label: 'Senegal (SN)' },
  { value: 'RS', label: 'Serbia (RS)' },
  { value: 'SC', label: 'Seychelles (SC)' },
  { value: 'SL', label: 'Sierra Leone (SL)' },
  { value: 'SG', label: 'Singapore (SG)' },
  { value: 'SX', label: 'Sint Maarten (SX)' },
  { value: 'SK', label: 'Slovakia (SK)' },
  { value: 'SI', label: 'Slovenia (SI)' },
  { value: 'SB', label: 'Solomon Islands (SB)' },
  { value: 'SO', label: 'Somalia (SO)' },
  { value: 'ZA', label: 'South Africa (ZA)' },
  { value: 'GS', label: 'South Georgia and the South Sandwich Islands (GS)' },
  { value: 'SS', label: 'South Sudan (SS)' },
  { value: 'ES', label: 'Spain (ES)' },
  { value: 'LK', label: 'Sri Lanka (LK)' },
  { value: 'SD', label: 'Sudan (SD)' },
  { value: 'SR', label: 'Suriname (SR)' },
  { value: 'SJ', label: 'Svalbard and Jan Mayen (SJ)' },
  { value: 'SE', label: 'Sweden (SE)' },
  { value: 'CH', label: 'Switzerland (CH)' },
  { value: 'SY', label: 'Syria (SY)' },
  { value: 'TW', label: 'Taiwan (TW)' },
  { value: 'TJ', label: 'Tajikistan (TJ)' },
  { value: 'TZ', label: 'Tanzania (TZ)' },
  { value: 'TH', label: 'Thailand (TH)' },
  { value: 'TL', label: 'Timor-Leste (TL)' },
  { value: 'TG', label: 'Togo (TG)' },
  { value: 'TK', label: 'Tokelau (TK)' },
  { value: 'TO', label: 'Tonga (TO)' },
  { value: 'TT', label: 'Trinidad and Tobago (TT)' },
  { value: 'TN', label: 'Tunisia (TN)' },
  { value: 'TR', label: 'Turkey (TR)' },
  { value: 'TM', label: 'Turkmenistan (TM)' },
  { value: 'TC', label: 'Turks and Caicos Islands (TC)' },
  { value: 'TV', label: 'Tuvalu (TV)' },
  { value: 'UG', label: 'Uganda (UG)' },
  { value: 'UA', label: 'Ukraine (UA)' },
  { value: 'AE', label: 'United Arab Emirates (AE)' },
  { value: 'GB', label: 'United Kingdom (GB)' },
  { value: 'US', label: 'United States (US)' },
  { value: 'UM', label: 'United States Minor Outlying Islands (UM)' },
  { value: 'UY', label: 'Uruguay (UY)' },
  { value: 'UZ', label: 'Uzbekistan (UZ)' },
  { value: 'VU', label: 'Vanuatu (VU)' },
  { value: 'VA', label: 'Vatican City (VA)' },
  { value: 'VE', label: 'Venezuela (VE)' },
  { value: 'VN', label: 'Vietnam (VN)' },
  { value: 'VG', label: 'Virgin Islands (British) (VG)' },
  { value: 'VI', label: 'Virgin Islands (US) (VI)' },
  { value: 'WF', label: 'Wallis and Futuna (WF)' },
  { value: 'EH', label: 'Western Sahara (EH)' },
  { value: 'YE', label: 'Yemen (YE)' },
  { value: 'ZM', label: 'Zambia (ZM)' },
  { value: 'ZW', label: 'Zimbabwe (ZW)' },
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDisplayDate(isoValue) {
  if (!isoValue) return '';
  const [year, month, day] = isoValue.split('-');
  if (!year || !month || !day) return isoValue;
  return `${day}/${month}/${year}`;
}

function normalizeToISO(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'string') {
    if (value.includes('/')) {
      const [day, month, year] = value.split('/');
      if (day && month && year) {
        return `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
    }
    return value.slice(0, 10);
  }
  return '';
}

function isoToLocalMidnight(iso) {
  if (!iso) return null;
  const safe = typeof iso === 'string' ? iso.slice(0, 10) : iso;
  const date = safe instanceof Date ? safe : new Date(`${safe}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfTodayLocal() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function DateField({ id, label, value, onChange, className = '', fieldRef, isInvalidDate }) {
  const [isOpen, setIsOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const displayValue = formatDisplayDate(value);

  const handleSelect = (next) => {
    const normalized = normalizeToISO(next);
    if (normalized) {
      onChange(normalized);
    }
    setIsOpen(false);
  };

  return (
    <div
      className={`proposal-basics__field ${className}`.trim()}
      ref={(node) => {
        if (typeof fieldRef === 'function') {
          fieldRef(node);
        }
      }}
    >
      <TextControl
        id={id}
        label={label}
        value={displayValue}
        onClick={(event) => {
          setAnchorEl(event.currentTarget);
          setIsOpen(true);
        }}
        onFocus={(event) => {
          setAnchorEl(event.currentTarget);
          setIsOpen(true);
        }}
        readOnly
        placeholder="DD/MM/AAAA"
      />
      {isOpen && anchorEl && (
        <Popover
          anchor={anchorEl}
          placement="bottom-start"
          className="proposal-basics__date-popover"
          onClose={() => {
            setIsOpen(false);
            setAnchorEl(null);
          }}
        >
          <DatePicker
            currentDate={value || todayISO()}
            onChange={handleSelect}
            isInvalidDate={isInvalidDate}
          />
        </Popover>
      )}
    </div>
  );
}

export default function StepBasics({ initialValues = {}, onCreated, onNext, proposalId }) {
const defaults = useMemo(() => {
  const base = {
    proposal_title: '',
    customer_name: initialValues.customer_name || '',
    customer_email: '',
    customer_country: '', // ISO2 opcional
    customer_language: 'es',
    start_date: todayISO(),
    end_date: todayISO(),
    pax_total: 1,
    players_count: initialValues.players_count ?? initialValues.pax_total ?? 1,
    currency: 'EUR',
    first_name: initialValues.first_name ?? '',
    last_name: initialValues.last_name ?? '',
    giav_agent_id: initialValues.giav_agent_id ?? initialValues.agent_id ?? '',
    ...initialValues,
  };

  const fallbackName = base.customer_name || initialValues.customer_name || '';
  const split = splitCustomerFullName(fallbackName);
  const firstName = base.first_name || split.firstName;
  const lastName = base.last_name || split.lastName;
  base.first_name = firstName;
  base.last_name = lastName;
  base.customer_name = buildCustomerFullName(firstName, lastName, fallbackName);
  if (base.giav_agent_id !== undefined && base.giav_agent_id !== null) {
    base.giav_agent_id = String(base.giav_agent_id);
  }

  return base;
}, [initialValues]);

  const [values, setValues] = useState(defaults);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [countryQuery, setCountryQuery] = useState('');
  const [agentOptions, setAgentOptions] = useState([]);
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentError, setAgentError] = useState('');
  const [selectedAgent, setSelectedAgent] = useState(null);
  const fieldRefs = useRef({});
  const agentSearchTimer = useRef(null);
  const agentAutofillDone = useRef(false);
  const isCreating = !proposalId;

  // ✅ FIX: al volver atrás, rehidratar el formulario con initialValues
  useEffect(() => {
    setValues((prev) => {
      const next = { ...prev, ...defaults };
      next.customer_name = buildCustomerFullName(
        next.first_name,
        next.last_name,
        defaults.customer_name
      );
      return next;
    });
  }, [defaults]);

  useEffect(() => {
    window.fillProposalBasics = (data = {}) => {
      setValues((prev) => {
        const nameValue = typeof data.name === 'string' ? data.name : prev.customer_name;
        const split = splitCustomerFullName(nameValue);
        const firstName = typeof data.first_name === 'string' ? data.first_name : split.firstName || prev.first_name;
        const lastName = typeof data.last_name === 'string' ? data.last_name : split.lastName || prev.last_name;
        const rawAgentId = data.giav_agent_id ?? data.agent_id ?? data.agente_comercial_id ?? null;
        const agentId = rawAgentId !== null && rawAgentId !== undefined ? String(rawAgentId) : prev.giav_agent_id;
        return {
          ...prev,
          proposal_title: typeof data.title === 'string' ? data.title : prev.proposal_title,
          first_name: firstName,
          last_name: lastName,
          customer_name: buildCustomerFullName(firstName, lastName, nameValue),
          customer_email: typeof data.email === 'string' ? data.email : prev.customer_email,
          customer_country:
            typeof data.country === 'string' ? data.country.toUpperCase() : prev.customer_country,
          customer_language:
            typeof data.language === 'string' ? data.language : prev.customer_language,
          giav_agent_id: agentId,
        };
      });
    };

    return () => {
      delete window.fillProposalBasics;
    };
  }, []);

  const currentUserEmail = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const portalEmail = window.CASANOVA_GESTION_RESERVAS?.currentUser?.email;
    const adminEmail = window.WP_TRAVEL_GIAV?.currentUser?.email;
    return portalEmail || adminEmail || '';
  }, []);

  const normalizeAgentOption = (agent) => {
    if (!agent) return null;
    const id = String(agent.id ?? agent.Id ?? agent.ID ?? '');
    const label = String(agent.label ?? agent.title ?? agent.Nombre ?? agent.AliasAgente ?? '');
    if (!id || !label) return null;
    return { value: id, label, email: agent.email ?? agent.Correo ?? '' };
  };

  const upsertAgentOption = (option) => {
    if (!option) return;
    setSelectedAgent(option);
    setAgentOptions((prev) => {
      const next = prev.filter((item) => item.value !== option.value);
      return [option, ...next];
    });
  };

  const fetchAgents = async ({ query = '', email = '' } = {}) => {
    const term = String(query || '').trim();
    const emailValue = String(email || '').trim();
    const inferredEmail = !emailValue && term.includes('@') ? term : '';
    const searchEmail = emailValue || inferredEmail;
    const searchTerm = inferredEmail ? '' : term;

    if (searchTerm.length < 2 && !searchEmail) {
      setAgentError('');
      return;
    }

    setAgentLoading(true);
    setAgentError('');

    try {
      const res = await API.searchGiavAgents({
        q: searchTerm || undefined,
        email: searchEmail || undefined,
        pageSize: 20,
        pageIndex: 0,
        includeLinked: true,
        includeBlocked: false,
      });

      const nextOptions = (res?.items || [])
        .map(normalizeAgentOption)
        .filter(Boolean);

      setAgentOptions((prev) => {
        const base = [...nextOptions];
        if (selectedAgent && !base.some((item) => item.value === selectedAgent.value)) {
          base.unshift(selectedAgent);
        }
        return base;
      });
    } catch (e) {
      setAgentError(e?.message || 'Error buscando agentes en GIAV');
    } finally {
      setAgentLoading(false);
    }
  };

  const scheduleAgentSearch = (nextQuery) => {
    setAgentError('');
    if (agentSearchTimer.current) {
      clearTimeout(agentSearchTimer.current);
    }
    agentSearchTimer.current = setTimeout(() => {
      fetchAgents({ query: nextQuery });
    }, 250);
  };

  useEffect(() => {
    if (agentAutofillDone.current) {
      return;
    }
    if (!currentUserEmail || values.giav_agent_id) {
      return;
    }
    agentAutofillDone.current = true;

    let active = true;
    const run = async () => {
      try {
        const res = await API.searchGiavAgents({
          email: currentUserEmail,
          pageSize: 5,
          pageIndex: 0,
          includeLinked: true,
          includeBlocked: false,
        });
        if (!active) return;
        const list = res?.items || [];
        if (list.length === 0) return;
        const exact = list.find((item) => (item.email || '').toLowerCase() === currentUserEmail.toLowerCase());
        const option = normalizeAgentOption(exact || list[0]);
        if (!option) return;

        setValues((prev) => {
          if (prev.giav_agent_id) {
            return prev;
          }
          return { ...prev, giav_agent_id: option.value };
        });
        upsertAgentOption(option);
      } catch (e) {
        if (active) {
          setAgentError(e?.message || 'No se pudo autocompletar el agente.');
        }
      }
    };

    run();
    return () => {
      active = false;
    };
  }, [currentUserEmail, values.giav_agent_id]);

  useEffect(() => {
    const currentId = values.giav_agent_id ? String(values.giav_agent_id) : '';
    if (!currentId) {
      setSelectedAgent(null);
      return;
    }
    if (selectedAgent && selectedAgent.value === currentId) {
      return;
    }
    const existing = agentOptions.find((item) => item.value === currentId);
    if (existing) {
      setSelectedAgent(existing);
      return;
    }

    let active = true;
    const load = async () => {
      try {
        const res = await API.getGiavAgent(currentId);
        if (!active) return;
        const option = normalizeAgentOption(res);
        if (option) {
          upsertAgentOption(option);
        }
      } catch (e) {
        // ignore lookup errors
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [values.giav_agent_id, agentOptions, selectedAgent]);

  const set = (key) => (val) => {
    setValues((v) => {
      const next = { ...v, [key]: val };
      if (key === 'first_name' || key === 'last_name') {
        const first = key === 'first_name' ? val : v.first_name;
        const last = key === 'last_name' ? val : v.last_name;
        next.customer_name = buildCustomerFullName(first, last, v.customer_name);
      }
      return next;
    });
    setFieldError((prev) => (prev === key ? '' : prev));
  };

  const registerField = (key) => (node) => {
    if (node) {
      fieldRefs.current[key] = node;
    }
  };

  const focusField = (key) => {
    const target = fieldRefs.current[key];
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const input = target.querySelector('input, select, textarea, button');
    if (input && typeof input.focus === 'function') {
      input.focus();
    }
  };

  const onChangeStartDate = (v) => {
    setValues((prev) => {
      const next = { ...prev, start_date: v };
      if (next.end_date && v && next.end_date < v) {
        next.end_date = v;
      }
      return next;
    });

    // UX: saltar al campo fin y abrir picker si se puede
    window.setTimeout(() => {
      const el = document.getElementById('wp-travel-end-date');
      if (!el) return;
      el.focus();
      if (typeof el.showPicker === 'function') {
        try {
          el.showPicker();
        } catch (e) {}
      }
    }, 0);
  };

  const onChangeEndDate = (v) => {
    setValues((prev) => {
      if (prev.start_date && v && v < prev.start_date) {
        return { ...prev, end_date: prev.start_date };
      }
      return { ...prev, end_date: v };
    });
  };

  const validate = () => {
    if (!values.first_name?.trim()) {
      return { message: 'El nombre del cliente es obligatorio.', field: 'first_name' };
    }
    if (!values.start_date) {
      return { message: 'La fecha de inicio es obligatoria.', field: 'start_date' };
    }
    if (!values.end_date) {
      return { message: 'La fecha de fin es obligatoria.', field: 'end_date' };
    }
    if (values.end_date < values.start_date) {
      return { message: 'La fecha fin no puede ser anterior a la fecha inicio.', field: 'end_date' };
    }
    const pax = parseInt(values.pax_total, 10);
    if (Number.isNaN(pax) || pax < 1) {
      return { message: 'Pax debe ser un numero >= 1.', field: 'pax_total' };
    }
    const playersCount = parseInt(values.players_count, 10);
    if (Number.isNaN(playersCount) || playersCount < 0) {
      return { message: 'Jugadores debe ser un numero >= 0.', field: 'players_count' };
    }
    if (playersCount > pax) {
      return { message: 'Jugadores no puede ser mayor que Pax.', field: 'players_count' };
    }
    if (values.customer_email && !/^\S+@\S+\.\S+$/.test(values.customer_email)) {
      return { message: 'El email no parece valido (si lo rellenas, que sea correcto).', field: 'customer_email' };
    }
    if (values.customer_country && values.customer_country.length !== 2) {
      return { message: 'Destino debe ser ISO2 (2 letras) o vacio.', field: 'customer_country' };
    }
    if (values.giav_agent_id && !/^\d+$/.test(String(values.giav_agent_id))) {
      return { message: 'Agente comercial debe ser un ID valido o vacio.', field: 'giav_agent_id' };
    }
    return null;
  };

  const onSubmit = async () => {
    const issue = validate();
    if (issue) {
      setSaved('');
      setError(issue.message);
      setFieldError(issue.field || '');
      focusField(issue.field);
      return;
    }

    setLoading(true);
    setSaved('');
    setError('');

    // ✅ payload definido SIEMPRE (antes del try)
    const computedCustomerName = buildCustomerFullName(
      values.first_name,
      values.last_name,
      values.customer_name
    );

    const payload = {
      ...values,
      customer_name: computedCustomerName,
      pax_total: parseInt(values.pax_total, 10),
      players_count: Math.max(0, parseInt(values.players_count, 10)),
      customer_country: values.customer_country ? values.customer_country.toUpperCase() : '',
      giav_agent_id: (() => {
        const agentId = parseInt(values.giav_agent_id, 10);
        return Number.isFinite(agentId) && agentId > 0 ? agentId : null;
      })(),
    };

    try {
      if (proposalId) {
        // ya existe: no recrear propuesta, solo avanzar guardando basics
        await API.updateProposal(proposalId, payload);
        onNext?.({ basics: payload });
        return;
      }

      const res = await API.createProposal(payload);

      onCreated?.({
        proposalId: res.proposal_id,
        basics: payload,
      });
    } catch (e) {
      setError(e?.message || 'Error creando la propuesta.');
    } finally {
      setLoading(false);
    }
  };


  const onSaveOnly = async () => {
    if (!proposalId) return;
    const issue = validate();
    if (issue) {
      setSaved('');
      setError(issue.message);
      setFieldError(issue.field || '');
      focusField(issue.field);
      return;
    }

    setLoading(true);
    setError('');
    setSaved('');

    const computedCustomerName = buildCustomerFullName(
      values.first_name,
      values.last_name,
      values.customer_name
    );

    const payload = {
      ...values,
      customer_name: computedCustomerName,
      pax_total: parseInt(values.pax_total, 10),
      players_count: Math.max(0, parseInt(values.players_count, 10)),
      customer_country: values.customer_country ? values.customer_country.toUpperCase() : '',
      giav_agent_id: (() => {
        const agentId = parseInt(values.giav_agent_id, 10);
        return Number.isFinite(agentId) && agentId > 0 ? agentId : null;
      })(),
    };

    try {
      await API.updateProposal(proposalId, payload);
      setSaved('Cambios guardados.');
    } catch (e) {
      setError(e?.message || 'Error guardando la propuesta.');
    } finally {
      setLoading(false);
    }
  };
  const filteredCountryOptions = useMemo(() => {
    if (!countryQuery) return COUNTRY_OPTIONS;
    const search = countryQuery.toLowerCase();
    return COUNTRY_OPTIONS.filter(
      (option) => option.label.toLowerCase().includes(search) || option.value.toLowerCase().includes(search)
    );
  }, [countryQuery]);

  const agentOptionsWithSelected = useMemo(() => {
    if (!selectedAgent) {
      return agentOptions;
    }
    if (agentOptions.some((item) => item.value === selectedAgent.value)) {
      return agentOptions;
    }
    return [selectedAgent, ...agentOptions];
  }, [agentOptions, selectedAgent]);

  const agentHelp = agentError
    ? agentError
    : agentLoading
    ? 'Buscando agentes en GIAV...'
    : '';

  const paxValue = parseInt(values.pax_total, 10);
  const playersValue = parseInt(values.players_count, 10);
  const nonPlayersCount = Number.isFinite(paxValue)
    ? Math.max(0, paxValue - (Number.isFinite(playersValue) ? playersValue : 0))
    : 0;

  return (
    <Card>
      <CardHeader>
        <strong>Datos básicos</strong>
      </CardHeader>

      <CardBody>
        {saved && (
          <Notice status="success" isDismissible onRemove={() => setSaved('')}>
            {saved}
          </Notice>
        )}

        {error && (
          <Notice
            status="error"
            isDismissible
            onRemove={() => {
              setError('');
              setSaved('');
              setFieldError('');
            }}
          >
            {error}
          </Notice>
        )}

        <div className="proposal-basics">
          <div className="proposal-basics__section">
            <div className="proposal-basics__section-title">Identidad de la propuesta</div>
            <div className="proposal-basics__grid">
              <div
                className={`proposal-basics__field proposal-basics__field--full ${
                  fieldError === 'proposal_title' ? 'is-error' : ''
                }`.trim()}
                ref={registerField('proposal_title')}
              >
                <TextControl
                  label="Título de la propuesta"
                  value={values.proposal_title}
                  onChange={set('proposal_title')}
                  placeholder="Escapada a la Costa del Sol"
                />
              </div>

              <div
                className={`proposal-basics__field ${fieldError === 'first_name' ? 'is-error' : ''}`.trim()}
                ref={registerField('first_name')}
              >
                <TextControl
                  label="Nombre *"
                  value={values.first_name}
                  onChange={set('first_name')}
                  placeholder="John"
                />
              </div>
              <div
                className="proposal-basics__field"
                ref={registerField('last_name')}
              >
                <TextControl
                  label="Apellidos"
                  value={values.last_name}
                  onChange={set('last_name')}
                  placeholder="Doe"
                />
              </div>

              <div
                className={`proposal-basics__field ${fieldError === 'customer_email' ? 'is-error' : ''}`.trim()}
                ref={registerField('customer_email')}
              >
                <TextControl
                  label="Email"
                  value={values.customer_email}
                  onChange={set('customer_email')}
                  placeholder="john@email.com"
                />
              </div>
            </div>
          </div>

          <div className="proposal-basics__section">
            <div className="proposal-basics__section-title">Fechas y pasajeros</div>
            <div className="proposal-basics__grid proposal-basics__grid--dates">
              <DateField
                label="Fecha inicio *"
                value={values.start_date}
                onChange={onChangeStartDate}
                className={fieldError === 'start_date' ? 'is-error' : ''}
                fieldRef={registerField('start_date')}
                isInvalidDate={(date) => {
                  if (!isCreating) return false;
                  const candidate = isoToLocalMidnight(normalizeToISO(date));
                  if (!candidate) return false;
                  return candidate < startOfTodayLocal();
                }}
              />
              <div className="proposal-basics__date-arrow" aria-hidden="true">
                →
              </div>
              <DateField
                id="wp-travel-end-date"
                label="Fecha fin *"
                value={values.end_date}
                onChange={onChangeEndDate}
                className={fieldError === 'end_date' ? 'is-error' : ''}
                fieldRef={registerField('end_date')}
                isInvalidDate={(date) => {
                  const candidate = isoToLocalMidnight(normalizeToISO(date));
                  if (!candidate) return false;

                  // En creación, nunca permitimos fechas pasadas.
                  const min = isCreating
                    ? isoToLocalMidnight(values.start_date) || startOfTodayLocal()
                    : isoToLocalMidnight(values.start_date);

                  if (!min) return false;
                  return candidate < min;
                }}
              />
              <div
                className={`proposal-basics__field proposal-basics__field--pax ${
                  fieldError === 'pax_total' ? 'is-error' : ''
                }`.trim()}
                ref={registerField('pax_total')}
              >
                <TextControl
                  label="Pax *"
                  type="number"
                  min={1}
                  value={String(values.pax_total)}
                  onChange={set('pax_total')}
                />
              </div>
              <div
                className={`proposal-basics__field proposal-basics__field--pax ${
                  fieldError === 'players_count' ? 'is-error' : ''
                }`.trim()}
                ref={registerField('players_count')}
              >
                <TextControl
                  label="Jugadores"
                  type="number"
                  min={0}
                  value={String(values.players_count ?? '')}
                  onChange={set('players_count')}
                  help={`No jugadores: ${nonPlayersCount}`}
                />
              </div>
            </div>
          </div>

          <div className="proposal-basics__section">
            <div className="proposal-basics__section-title">Preferencias</div>
            <div className="proposal-basics__grid">
              <div
                className={`proposal-basics__field ${fieldError === 'customer_language' ? 'is-error' : ''}`.trim()}
                ref={registerField('customer_language')}
              >
                <SelectControl
                  label="Idioma"
                  value={values.customer_language}
                  options={LANG_OPTIONS}
                  onChange={set('customer_language')}
                />
              </div>

              <div
                className={`proposal-basics__field ${fieldError === 'customer_country' ? 'is-error' : ''}`.trim()}
                ref={registerField('customer_country')}
              >
                <ComboboxControl
                  label="Destino Viaje"
                  value={values.customer_country}
                  options={filteredCountryOptions}
                  onFilterValueChange={setCountryQuery}
                  onChange={(next) => set('customer_country')(next ? next.toUpperCase() : '')}
                  placeholder="Busca destino o codigo"
                />
              </div>

              <div
                className={`proposal-basics__field ${fieldError === 'giav_agent_id' ? 'is-error' : ''}`.trim()}
                ref={registerField('giav_agent_id')}
              >
                <ComboboxControl
                  label="Agente Comercial"
                  value={values.giav_agent_id}
                  options={agentOptionsWithSelected}
                  onFilterValueChange={scheduleAgentSearch}
                  onChange={(next) => {
                    const id = next ? String(next) : '';
                    if (!id) {
                      set('giav_agent_id')('');
                      setSelectedAgent(null);
                      return;
                    }
                    const picked = agentOptionsWithSelected.find((item) => item.value === id);
                    if (!picked && !/^\d+$/.test(id)) {
                      return;
                    }
                    set('giav_agent_id')(id);
                    if (picked) {
                      setSelectedAgent(picked);
                    }
                  }}
                  placeholder="Busca por nombre, alias o email"
                  help={agentHelp}
                />
              </div>

              <div
                className={`proposal-basics__field ${fieldError === 'currency' ? 'is-error' : ''}`.trim()}
                ref={registerField('currency')}
              >
                <SelectControl
                  label="Moneda"
                  value={values.currency}
                  options={CURRENCY_OPTIONS}
                  onChange={set('currency')}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="proposal-basics__actions">
          {proposalId && (
            <Button variant="secondary" onClick={onSaveOnly} disabled={loading}>
              Guardar
            </Button>
          )}
          <Button variant="primary" onClick={onSubmit} disabled={loading}>
            {error ? 'Revisa los campos marcados' : 'Continuar'}
          </Button>
          {loading && <Spinner />}
        </div>
      </CardBody>
    </Card>
  );
}
