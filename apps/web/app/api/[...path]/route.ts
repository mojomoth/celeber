import { dispatchApiRequest } from '../../../src/server/api';
import { withBrowserApi } from '../../../src/server/browser-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const dispatch = withBrowserApi(dispatchApiRequest);

export { dispatch as GET, dispatch as HEAD, dispatch as POST, dispatch as PATCH, dispatch as DELETE, dispatch as OPTIONS };
