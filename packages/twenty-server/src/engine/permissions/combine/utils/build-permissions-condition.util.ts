/* @license Enterprise */

import { isDefined } from 'twenty-shared/utils';

import {
  type PermissionsRowAccessSqlRequest,
  type SqlCondition,
} from 'src/engine/permissions/combine/types/row-access-policy.type';
import { buildPermissionsGrantCondition } from 'src/engine/permissions/combine/utils/build-permissions-grant-condition.util';
import { combineSqlConditions } from 'src/engine/permissions/combine/utils/combine-sql-conditions.util';
import { buildPermissionsDirectMessageCondition } from 'src/engine/permissions/direct-message/utils/build-permissions-direct-message-condition.util';

export const buildPermissionsCondition = ({
  tableAlias,
  ...request
}: Omit<PermissionsRowAccessSqlRequest, 'tableAlias'> & {
  tableAlias?: string;
}): SqlCondition | boolean => {
  const sqlRequest = {
    ...request,
    tableAlias: tableAlias ?? request.flatObjectMetadata.nameSingular,
  };
  const grantCondition = buildPermissionsGrantCondition(sqlRequest);

  if (grantCondition === false) {
    return false;
  }

  const directMessageCondition =
    buildPermissionsDirectMessageCondition(sqlRequest);

  if (!isDefined(directMessageCondition)) {
    return grantCondition;
  }

  if (directMessageCondition === false || grantCondition === true) {
    return directMessageCondition;
  }

  return combineSqlConditions([grantCondition, directMessageCondition]);
};
