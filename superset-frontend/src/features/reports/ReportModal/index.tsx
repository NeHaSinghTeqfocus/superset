/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import React, {
  useState,
  useEffect,
  useReducer,
  useCallback,
  useMemo,
} from 'react';
import { t, SupersetTheme } from '@superset-ui/core';
import { useDispatch, useSelector } from 'react-redux';
import { getClientErrorObject } from 'src/utils/getClientErrorObject';
import {
  addReport,
  editReport,
} from 'src/features/reports/ReportModal/actions';
import Alert from 'src/components/Alert';
import TimezoneSelector from 'src/components/TimezoneSelector';
import LabeledErrorBoundInput from 'src/components/Form/LabeledErrorBoundInput';
import Icons from 'src/components/Icons';
import { CronError } from 'src/components/CronPicker';
import { RadioChangeEvent } from 'src/components';
import { Input } from 'src/components/Input';
import withToasts from 'src/components/MessageToasts/withToasts';
import { ChartState } from 'src/explore/types';
import {
  ReportCreationMethod,
  ReportObject,
  NotificationFormats,
} from 'src/features/reports/types';
import { reportSelector } from 'src/views/CRUD/hooks';
import { StyledInputContainer } from 'src/features/alerts/AlertReportModal';
import { CreationMethod } from './HeaderReportDropdown';
import {
  antDErrorAlertStyles,
  CustomWidthHeaderStyle,
  StyledModal,
  StyledTopSection,
  StyledBottomSection,
  StyledIconWrapper,
  StyledScheduleTitle,
  StyledCronPicker,
  StyledCronError,
  noBottomMargin,
  StyledFooterButton,
  TimezoneHeaderStyle,
  SectionHeaderStyle,
  StyledMessageContentTitle,
  StyledRadio,
  StyledRadioGroup,
} from './styles';
import { Select } from 'src/components';

interface ReportProps {
  onHide: () => {};
  addDangerToast: (msg: string) => void;
  show: boolean;
  userId: number;
  userEmail: string;
  chart?: ChartState;
  chartName?: string;
  dashboardId?: number;
  dashboardName?: string;
  creationMethod: ReportCreationMethod;
  props: any;
  type: string;
}

const TEXT_BASED_VISUALIZATION_TYPES = [
  'pivot_table_v2',
  'table',
  'paired_ttest',
];

const INITIAL_STATE = {
  crontab: '0 12 * * 1',
};

type ReportObjectState = Partial<ReportObject> & {
  error?: string;
  /**
   * Is submitting changes to the backend.
   */
  isSubmitting?: boolean;
};

// Same instance to be used in useEffects
const EMPTY_OBJECT = {};

function ReportModal({
  onHide,
  show = false,
  dashboardId,
  chart,
  userId,
  userEmail,
  creationMethod,
  dashboardName,
  chartName,
  type,
}: ReportProps) {
  const vizType = chart?.sliceFormData?.viz_type;
  const isChart = !!chart;
  const isTextBasedChart =
    isChart && vizType && TEXT_BASED_VISUALIZATION_TYPES.includes(vizType);
  const defaultNotificationFormat = isTextBasedChart
    ? NotificationFormats.Text
    : NotificationFormats.PNG;
  const entityName = dashboardName || chartName;
  const initialState: ReportObjectState = useMemo(
    () => ({
      ...INITIAL_STATE,
      name: entityName
        ? t('Weekly Report for %s', entityName)
        : t('Weekly Report'),
    }),
    [entityName],
  );

  const reportReducer = useCallback(
    (state: ReportObjectState | null, action: 'reset' | ReportObjectState) => {
      if (action === 'reset') {
        return initialState;
      }
      return {
        ...state,
        ...action,
      };
    },
    [initialState],
  );

  const [currentReport, setCurrentReport] = useReducer(
    reportReducer,
    initialState,
  );
  const [cronError, setCronError] = useState<CronError>();
  const [method, setMethod] = useState<string>(
    currentReport.recipients && type !== 'email report'
      ? currentReport.recipients[0]?.type
      : 'S3',
  );
  const s3SubTypes = ['AWS_S3_credentials', 'AWS_S3_pyconfig', 'AWS_S3_IAM'];

  const dispatch = useDispatch();
  // Report fetch logic
  const report = useSelector<any, ReportObject>(state => {
    const resourceType = dashboardId
      ? CreationMethod.Dashboards
      : CreationMethod.Charts;
    return (
      reportSelector(state, resourceType, dashboardId || chart?.id) ||
      EMPTY_OBJECT
    );
  });
  const isEditMode = report && Object.keys(report).length;
  const [s3Method, setS3Method] = useState(
    currentReport ? currentReport?.aws_S3_types : null,
  );
  const [bucketName, setBucketName] = useState<string>('');
  const [accessKey, setAccessKey] = useState<string>('');
  const [secretKey, setSecretKey] = useState<string>('');

  useEffect(() => {
    if (currentReport.aws_S3_types) {
      setS3Method(currentReport.aws_S3_types);
      setAccessKey(currentReport ? currentReport?.aws_key : '');
      setSecretKey(currentReport ? currentReport?.aws_secretKey : '');
    }
  }, [currentReport, isEditMode]);

  useEffect(() => {
    if (currentReport.aws_S3_types === s3Method) {
      const nonEmptySettings = (currentReport.recipients || [])
        .map(setting => {
          const config =
            typeof setting.recipient_config_json === 'string'
              ? JSON.parse(setting.recipient_config_json)
              : {};
          return config.target || '';
        })
        .filter(target => target !== '' && target !== undefined);
      if (nonEmptySettings.length > 0) {
        setBucketName(nonEmptySettings[0]);
      }
    }
  }, [currentReport, s3Method]);

  useEffect(() => {
    if (isEditMode) {
      setCurrentReport(report);
    } else {
      setCurrentReport('reset');
    }
  }, [isEditMode, report]);

  const onSave = async () => {
    // Create new Report
    const newReportValues: Partial<ReportObject> = {
      type: 'Report',
      active: true,
      force_screenshot: false,
      custom_width: currentReport.custom_width,
      creation_method: creationMethod,
      dashboard: dashboardId,
      chart: chart?.id,
      owners: [userId],
      recipients: [
        {
          recipient_config_json: {
            target: `${type === 'email report' ? userEmail : bucketName}`,
          },
          type: `${type === 's3 report' ? 'S3' : 'Email'}`,
        },
      ],
      name: currentReport.name,
      description: currentReport.description,
      crontab: currentReport.crontab,
      report_format: currentReport.report_format || defaultNotificationFormat,
      timezone: currentReport.timezone,
      aws_key: accessKey,
      aws_secretKey: secretKey,
      aws_S3_types: s3Method,
    };

    setCurrentReport({ isSubmitting: true, error: undefined });
    try {
      if (isEditMode) {
        await dispatch(
          editReport(currentReport.id, newReportValues as ReportObject),
        );
      } else {
        await dispatch(addReport(newReportValues as ReportObject));
      }
      onHide();
    } catch (e) {
      const { error } = await getClientErrorObject(e);
      setCurrentReport({ error });
    }
    setCurrentReport({ isSubmitting: false });
  };

  useEffect(() => {
    if (currentReport.recipients && currentReport.recipients[0]?.type) {
      setMethod(currentReport.recipients[0]?.type);
    }
  }, [method]);

  const wrappedTitle = (
    <StyledIconWrapper>
      <Icons.Calendar />
      {type === 's3 report' ? (
        <span className="text">
          {isEditMode
            ? t('Edit AWS S3 report')
            : t('Schedule a new AWS S3 report')}
        </span>
      ) : (
        <span className="text">
          {isEditMode
            ? t('Edit email report')
            : t('Schedule a new email report')}
        </span>
      )}
    </StyledIconWrapper>
  );

  const renderModalFooter = (
    <>
      <StyledFooterButton key="back" onClick={onHide}>
        {t('Cancel')}
      </StyledFooterButton>
      <StyledFooterButton
        key="submit"
        buttonStyle="primary"
        onClick={onSave}
        disabled={!currentReport.name}
        loading={currentReport.isSubmitting}
      >
        {isEditMode ? t('Save') : t('Add')}
      </StyledFooterButton>
    </>
  );

  const renderMessageContentSection = (
    <>
      <StyledMessageContentTitle>
        <h4>{t('Message content')}</h4>
      </StyledMessageContentTitle>
      <div className="inline-container">
        <StyledRadioGroup
          onChange={(event: RadioChangeEvent) => {
            setCurrentReport({ report_format: event.target.value });
          }}
          value={currentReport.report_format || defaultNotificationFormat}
        >
          {isTextBasedChart && (
            <StyledRadio value={NotificationFormats.Text}>
              {t('Text embedded in email')}
            </StyledRadio>
          )}
          <StyledRadio value={NotificationFormats.PNG}>
            {t('Image (PNG) embedded in email')}
          </StyledRadio>
          <StyledRadio value={NotificationFormats.CSV}>
            {t('Formatted CSV attached in email')}
          </StyledRadio>
        </StyledRadioGroup>
      </div>
    </>
  );
  const handleS3Method = (e: any) => {
    setS3Method(e);
    if (e !== currentReport.aws_S3_types) {
      setBucketName('');
    }
  };
  const handleAccesskey = (e: any) => {
    setAccessKey(e.target.value);
  };

  const handleSecretkey = (e: any) => {
    setSecretKey(e.target.value);
  };

  const handleBucketName = (e: any) => {
    const newBucketName = e.target.value;
    setBucketName(newBucketName);
  };

  const renderS3MethodInputs = () => {
    if (method !== 'S3') {
      return null;
    }

    return (
      <>
        {method === 'S3' && (
          <div
            style={{ marginTop: '10px', marginBottom: '6px' }}
            className="inline-container"
          >
            <div className="input-container">
              <Select
                name="select-s3"
                ariaLabel={t('S3 methods')}
                data-test="select-s3-method"
                onChange={handleS3Method}
                placeholder="Select S3 Method"
                options={s3SubTypes.map((option: string) => ({
                  label: option,
                  value: option,
                }))}
                value={s3Method}
              />
            </div>
          </div>
        )}
        {s3Method === 'AWS_S3_credentials' && (
          <div>
            <div className="control-label">{t('Bucket Name')}</div>
            <LabeledErrorBoundInput
              data-test="test-bucket"
              type="text"
              placeholder={t('Type[Bucket Name]')}
              name="bucketName"
              value={bucketName}
              validationMethods={{
                onChange: handleBucketName,
              }}
              css={noBottomMargin}
            />

            <div className="control-label">{t('Access Key')}</div>
            <LabeledErrorBoundInput
              data-test="test-access"
              type="password"
              placeholder={t('Type[Access Key]')}
              name="accessKey"
              value={accessKey}
              validationMethods={{
                onChange: handleAccesskey,
              }}
              css={noBottomMargin}
            />
            <div className="control-label">{t('Secret Key')}</div>
            <LabeledErrorBoundInput
              data-test="test-secret"
              type="password"
              placeholder={t('Type[Secret Key]')}
              name="secretKey"
              value={secretKey}
              validationMethods={{
                onChange: handleSecretkey,
              }}
              css={noBottomMargin}
            />
          </div>
        )}
        {(s3Method === 'AWS_S3_IAM' || s3Method === 'AWS_S3_pyconfig') && (
          <>
            <div className="control-label">{t('Bucket Name')}</div>
            <LabeledErrorBoundInput
              type="text"
              placeholder="Type[Bucket Name]"
              name="bucketName"
              value={bucketName}
              validationMethods={{
                onChange: handleBucketName,
              }}
              css={noBottomMargin}
            />
          </>
        )}
      </>
    );
  };

  const renderCustomWidthSection = (
    <StyledInputContainer>
      <div className="control-label" css={CustomWidthHeaderStyle}>
        {t('Screenshot width')}
      </div>
      <div className="input-container">
        <Input
          type="number"
          name="custom_width"
          value={currentReport?.custom_width || ''}
          placeholder={t('Input custom width in pixels')}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            setCurrentReport({
              custom_width: parseInt(event.target.value, 10) || null,
            });
          }}
        />
      </div>
    </StyledInputContainer>
  );

  return (
    <StyledModal
      show={show}
      onHide={onHide}
      title={wrappedTitle}
      footer={renderModalFooter}
      width="432"
      centered
    >
      <StyledTopSection>
        <LabeledErrorBoundInput
          id="name"
          name="name"
          value={currentReport.name || ''}
          placeholder={initialState.name}
          required
          validationMethods={{
            onChange: ({ target }: { target: HTMLInputElement }) =>
              setCurrentReport({ name: target.value }),
          }}
          label={t('Report Name')}
          data-test="report-name-test"
        />
        <LabeledErrorBoundInput
          id="description"
          name="description"
          value={currentReport?.description || ''}
          validationMethods={{
            onChange: ({ target }: { target: HTMLInputElement }) => {
              setCurrentReport({ description: target.value });
            },
          }}
          label={t('Description')}
          placeholder={t(
            'Include a description that will be sent with your report',
          )}
          css={noBottomMargin}
          data-test="report-description-test"
        />
      </StyledTopSection>

      <StyledBottomSection>
        <StyledScheduleTitle>
          <h4 css={(theme: SupersetTheme) => SectionHeaderStyle(theme)}>
            {t('Schedule')}
          </h4>
          <p>
            {t('A screenshot of the dashboard will be sent to your email at')}
          </p>
        </StyledScheduleTitle>

        <StyledCronPicker
          clearButton={false}
          value={currentReport.crontab || '0 12 * * 1'}
          setValue={(newValue: string) => {
            setCurrentReport({ crontab: newValue });
          }}
          onError={setCronError}
        />
        <StyledCronError>{cronError}</StyledCronError>
        <div
          className="control-label"
          css={(theme: SupersetTheme) => TimezoneHeaderStyle(theme)}
        >
          {t('Timezone')}
        </div>
        <TimezoneSelector
          timezone={currentReport.timezone}
          onTimezoneChange={value => {
            setCurrentReport({ timezone: value });
          }}
        />
        {isChart && renderMessageContentSection}
        {/* Adding S3 fields */}
        {type === 's3 report' && renderS3MethodInputs()}
        {(!isChart || !isTextBasedChart) && renderCustomWidthSection}
      </StyledBottomSection>
      {currentReport.error && (
        <Alert
          type="error"
          css={(theme: SupersetTheme) => antDErrorAlertStyles(theme)}
          message={
            isEditMode
              ? t('Failed to update report')
              : t('Failed to create report')
          }
          description={currentReport.error}
        />
      )}
    </StyledModal>
  );
}

export default withToasts(ReportModal);
