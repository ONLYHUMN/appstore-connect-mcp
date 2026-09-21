/**
 * App Store Connect API Client
 * Real implementation using Apple's App Store Connect API
 */

import jwt from 'jsonwebtoken';

export interface AppStoreConfig {
  keyId: string;
  issuerId: string;
  privateKey: string;
}

export interface AppInfo {
  id: string;
  name: string;
  bundleId: string;
  appStoreId?: string;
  status: string;
  version?: string;
  platform?: string;
}

export interface SalesData {
  date: string;
  revenue: number;
  currency: string;
  transactionCount: number;
  units: number;
}

export interface AppStoreVersion {
  id: string;
  versionString: string;
  platform: string;
  appStoreState: string;
  releaseType?: string;
  earliestReleaseDate?: string;
  copyright?: string;
  createdDate: string;
}

export class AppStoreConnectClient {
  private config: AppStoreConfig;
  private baseUrl = 'https://api.appstoreconnect.apple.com';

  constructor(config: AppStoreConfig) {
    // Check if private key is base64 encoded and trim whitespace
    let privateKey = config.privateKey.trim();
    if (!privateKey.includes('BEGIN PRIVATE KEY')) {
      // Try to decode from base64
      try {
        const decoded = Buffer.from(privateKey, 'base64').toString('utf-8').trim();
        if (decoded.includes('BEGIN PRIVATE KEY')) {
          privateKey = decoded;
        }
      } catch (e) {
        // Not base64, use as is
      }
    }
    
    this.config = {
      ...config,
      privateKey
    };
  }

  /**
   * Generate JWT token for App Store Connect API authentication
   */
  private generateToken(): string {
    try {
      const payload = {
        iss: this.config.issuerId,
        exp: Math.floor(Date.now() / 1000) + (20 * 60), // 20 minutes
        aud: 'appstoreconnect-v1'
      };

      console.log('Generating JWT with issuer:', this.config.issuerId);
      console.log('Key ID:', this.config.keyId);
      
      const token = jwt.sign(payload, this.config.privateKey, {
        algorithm: 'ES256',
        header: {
          alg: 'ES256',
          kid: this.config.keyId,  // ✅ CORRECT: 'kid' in header
          typ: 'JWT'
        }
      });
      
      console.log('JWT generated successfully');
      return token;
    } catch (error: any) {
      console.error('Failed to generate JWT:', error.message);
      throw new Error(`JWT generation failed: ${error.message}`);
    }
  }

  /**
   * Make authenticated request to App Store Connect API
   */
  private async makeRequest(endpoint: string, options?: {
    method?: string;
    body?: any;
  }): Promise<any> {
    const token = this.generateToken();
    const url = `${this.baseUrl}${endpoint}`;
    
    console.log(`Making ${options?.method || 'GET'} request to: ${url}`);
    
    const response = await fetch(url, {
      method: options?.method || 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API Error Response (${response.status}):`, errorText);
      
      // Try to parse error as JSON for better error messages
      try {
        const errorJson = JSON.parse(errorText);
        const errorMessage = errorJson.errors?.[0]?.detail || errorJson.errors?.[0]?.title || errorText;
        throw new Error(`App Store API error: ${response.status} - ${errorMessage}`);
      } catch (parseError) {
        throw new Error(`App Store API error: ${response.status} ${response.statusText} - ${errorText}`);
      }
    }

    return response.json();
  }

  /**
   * List all apps in App Store Connect
   */
  async listApps(): Promise<AppInfo[]> {
    try {
      const data = await this.makeRequest('/v1/apps');
      
      return data.data?.map((app: any) => ({
        id: app.id,
        name: app.attributes.name,
        bundleId: app.attributes.bundleId,
        appStoreId: app.attributes.sku,
        status: app.attributes.appStoreState,
        platform: app.attributes.primaryLocale,
      })) || [];
    } catch (error: any) {
      console.error('Error listing apps:', error);
      throw new Error(`Failed to fetch apps from Apple Store Connect: ${error.message}`);
    }
  }

  /**
   * Get detailed information about a specific app
   */
  async getAppInfo(appId: string): Promise<AppInfo | null> {
    try {
      const data = await this.makeRequest(`/v1/apps/${appId}`);
      const app = data.data;
      
      if (!app) return null;

      return {
        id: app.id,
        name: app.attributes.name,
        bundleId: app.attributes.bundleId,
        appStoreId: app.attributes.sku,
        status: app.attributes.appStoreState,
        version: app.attributes.contentRightsDeclaration,
        platform: app.attributes.primaryLocale,
      };
    } catch (error: any) {
      console.error('Error getting app info:', error);
      throw new Error(`Failed to fetch app info from Apple Store Connect: ${error.message}`);
    }
  }

  /**
   * Get sales reports for a specific date
   */
  async getSalesData(date?: string): Promise<SalesData> {
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    try {
      const endpoint = `/v1/salesReports?filter[frequency]=DAILY&filter[reportDate]=${targetDate}&filter[reportType]=SALES&filter[vendorNumber]=${this.config.issuerId}`;
      const data = await this.makeRequest(endpoint);
      
      // Calculate totals from sales report
      const totalRevenue = data.data?.reduce((sum: number, item: any) => {
        return sum + (parseFloat(item.attributes?.proceeds || 0));
      }, 0) || 0;

      const totalUnits = data.data?.reduce((sum: number, item: any) => {
        return sum + (parseInt(item.attributes?.units || 0));
      }, 0) || 0;

      return {
        date: targetDate,
        revenue: totalRevenue,
        currency: 'USD',
        transactionCount: data.data?.length || 0,
        units: totalUnits,
      };
    } catch (error: any) {
      console.error('Error getting sales data:', error);
      throw new Error(`Failed to fetch sales data from Apple Store Connect: ${error.message}`);
    }
  }

  /**
   * Get app analytics data
   */
  async getAnalytics(appId: string): Promise<any> {
    try {
      // Note: Analytics API might require different endpoints or permissions
      const endpoint = `/v1/apps/${appId}/analyticsReportRequests`;
      return await this.makeRequest(endpoint);
    } catch (error: any) {
      console.error('Error getting analytics:', error);
      throw new Error(`Failed to fetch analytics from Apple Store Connect: ${error.message}`);
    }
  }

  /**
   * Get build information (TestFlight builds)
   */
  async getBuilds(appId: string): Promise<any[]> {
    try {
      const endpoint = `/v1/apps/${appId}/builds`;
      const data = await this.makeRequest(endpoint);
      
      return data.data?.map((build: any) => ({
        id: build.id,
        version: build.attributes.version,
        buildNumber: build.attributes.build,
        processingState: build.attributes.processingState,
        uploadedDate: build.attributes.uploadedDate,
      })) || [];
    } catch (error: any) {
      console.error('Error getting builds:', error);
      throw new Error(`Failed to fetch builds from Apple Store Connect: ${error.message}`);
    }
  }

  /**
   * List all app store versions for an app
   */
  async listAppStoreVersions(appId: string): Promise<AppStoreVersion[]> {
    try {
      const endpoint = `/v1/apps/${appId}/appStoreVersions`;
      const response = await this.makeRequest(endpoint);
      
      return response.data?.map((version: any) => ({
        id: version.id,
        versionString: version.attributes.versionString,
        platform: version.attributes.platform,
        appStoreState: version.attributes.appStoreState,
        releaseType: version.attributes.releaseType,
        earliestReleaseDate: version.attributes.earliestReleaseDate,
        copyright: version.attributes.copyright,
        createdDate: version.attributes.createdDate,
      })) || [];
    } catch (error: any) {
      console.error('Error listing app store versions:', error);
      throw new Error(`Failed to fetch app store versions from Apple Store Connect: ${error.message}`);
    }
  }

  /**
   * List beta groups for TestFlight
   */
  async listBetaGroups(appId: string): Promise<any[]> {
    try {
      const endpoint = `/v1/apps/${appId}/betaGroups`;
      const response = await this.makeRequest(endpoint);
      
      return response.data?.map((group: any) => ({
        id: group.id,
        name: group.attributes.name,
        isInternalGroup: group.attributes.isInternalGroup,
        publicLink: group.attributes.publicLink,
        publicLinkEnabled: group.attributes.publicLinkEnabled,
        publicLinkLimit: group.attributes.publicLinkLimit,
        publicLinkLimitEnabled: group.attributes.publicLinkLimitEnabled,
        createdDate: group.attributes.createdDate,
      })) || [];
    } catch (error: any) {
      console.error('Error listing beta groups:', error);
      throw new Error(`Failed to fetch beta groups from Apple Store Connect: ${error.message}`);
    }
  }

  /**
   * Add a tester to a beta group
   */
  async addTesterToBetaGroup(params: {
    groupId: string;
    email: string;
    firstName?: string;
    lastName?: string;
  }): Promise<any> {
    try {
      // First, create or get the beta tester
      const testerBody = {
        data: {
          type: 'betaTesters',
          attributes: {
            email: params.email,
            firstName: params.firstName,
            lastName: params.lastName,
          }
        }
      };

      let testerId: string;
      try {
        const testerResponse = await this.makeRequest('/v1/betaTesters', {
          method: 'POST',
          body: testerBody
        });
        testerId = testerResponse.data.id;
      } catch (error: any) {
        // If tester already exists, find them
        const existingTesters = await this.makeRequest(`/v1/betaTesters?filter[email]=${params.email}`);
        if (existingTesters.data && existingTesters.data.length > 0) {
          testerId = existingTesters.data[0].id;
        } else {
          throw error;
        }
      }

      // Add tester to group
      const addToGroupBody = {
        data: [
          {
            type: 'betaTesters',
            id: testerId
          }
        ]
      };

      await this.makeRequest(`/v1/betaGroups/${params.groupId}/relationships/betaTesters`, {
        method: 'POST',
        body: addToGroupBody
      });

      return {
        success: true,
        testerId,
        groupId: params.groupId,
        email: params.email,
        message: `Successfully added ${params.email} to beta group`,
      };
    } catch (error: any) {
      console.error('Error adding tester to beta group:', error);
      throw new Error(`Failed to add tester to beta group: ${error.message}`);
    }
  }

  /**
   * Update app store version localization (descriptions, keywords, etc.)
   */
  async updateAppStoreVersionLocalization(params: {
    versionId: string;
    locale: string;
    description?: string;
    keywords?: string;
    whatsNew?: string;
    promotionalText?: string;
    supportUrl?: string;
    marketingUrl?: string;
  }): Promise<any> {
    try {
      // First, check if localization exists
      const getEndpoint = `/v1/appStoreVersions/${params.versionId}/appStoreVersionLocalizations`;
      const existingData = await this.makeRequest(getEndpoint);
      
      const existingLocalization = existingData.data?.find(
        (loc: any) => loc.attributes.locale === params.locale
      );

      if (existingLocalization) {
        // Update existing localization
        const updateBody = {
          data: {
            type: 'appStoreVersionLocalizations',
            id: existingLocalization.id,
            attributes: {
              description: params.description,
              keywords: params.keywords,
              whatsNew: params.whatsNew,
              promotionalText: params.promotionalText,
              supportUrl: params.supportUrl,
              marketingUrl: params.marketingUrl,
            }
          }
        };

        const response = await this.makeRequest(
          `/v1/appStoreVersionLocalizations/${existingLocalization.id}`,
          {
            method: 'PATCH',
            body: updateBody
          }
        );

        return {
          id: response.data.id,
          locale: response.data.attributes.locale,
          description: response.data.attributes.description,
          keywords: response.data.attributes.keywords,
          whatsNew: response.data.attributes.whatsNew,
          promotionalText: response.data.attributes.promotionalText,
          supportUrl: response.data.attributes.supportUrl,
          marketingUrl: response.data.attributes.marketingUrl,
        };
      } else {
        // Create new localization
        const createBody = {
          data: {
            type: 'appStoreVersionLocalizations',
            attributes: {
              locale: params.locale,
              description: params.description,
              keywords: params.keywords,
              whatsNew: params.whatsNew,
              promotionalText: params.promotionalText,
              supportUrl: params.supportUrl,
              marketingUrl: params.marketingUrl,
            },
            relationships: {
              appStoreVersion: {
                data: {
                  type: 'appStoreVersions',
                  id: params.versionId
                }
              }
            }
          }
        };

        const response = await this.makeRequest('/v1/appStoreVersionLocalizations', {
          method: 'POST',
          body: createBody
        });

        return {
          id: response.data.id,
          locale: response.data.attributes.locale,
          description: response.data.attributes.description,
          keywords: response.data.attributes.keywords,
          whatsNew: response.data.attributes.whatsNew,
          promotionalText: response.data.attributes.promotionalText,
          supportUrl: response.data.attributes.supportUrl,
          marketingUrl: response.data.attributes.marketingUrl,
        };
      }
    } catch (error: any) {
      console.error('Error updating app store version localization:', error);
      throw new Error(`Failed to update app store version localization: ${error.message}`);
    }
  }

  /**
   * Create a new app store version
   */
  async createAppStoreVersion(params: {
    appId: string;
    platform: string;
    versionString: string;
    copyright?: string;
    releaseType?: string;
    earliestReleaseDate?: string;
    buildId?: string;
  }): Promise<AppStoreVersion> {
    try {
      const body = {
        data: {
          type: 'appStoreVersions',
          attributes: {
            platform: params.platform,
            versionString: params.versionString,
            copyright: params.copyright,
            releaseType: params.releaseType || 'MANUAL',
            earliestReleaseDate: params.earliestReleaseDate,
          },
          relationships: {
            app: {
              data: {
                type: 'apps',
                id: params.appId
              }
            }
          }
        }
      };

      // Add build relationship if provided
      if (params.buildId) {
        (body.data.relationships as any).build = {
          data: {
            type: 'builds',
            id: params.buildId
          }
        };
      }

      const response = await this.makeRequest('/v1/appStoreVersions', {
        method: 'POST',
        body
      });

      const version = response.data;
      return {
        id: version.id,
        versionString: version.attributes.versionString,
        platform: version.attributes.platform,
        appStoreState: version.attributes.appStoreState,
        releaseType: version.attributes.releaseType,
        earliestReleaseDate: version.attributes.earliestReleaseDate,
        copyright: version.attributes.copyright,
        createdDate: version.attributes.createdDate,
      };
    } catch (error: any) {
      console.error('Error creating app store version:', error);
      throw new Error(`Failed to create app store version: ${error.message}`);
    }
  }

  /**
   * Get customer reviews for an app
   */
  async getCustomerReviews(appId: string, limit: number = 50): Promise<any[]> {
    try {
      const data = await this.makeRequest(`/v1/apps/${appId}/customerReviews?limit=${limit}&sort=-createdDate`);
      
      return data.data?.map((review: any) => ({
        id: review.id,
        rating: review.attributes.rating,
        title: review.attributes.title,
        body: review.attributes.body,
        reviewerNickname: review.attributes.reviewerNickname,
        territory: review.attributes.territory,
        createdDate: review.attributes.createdDate,
        lastModifiedDate: review.attributes.lastModifiedDate
      })) || [];
    } catch (error: any) {
      console.error('Error getting customer reviews:', error);
      throw new Error(`Failed to get customer reviews: ${error.message}`);
    }
  }

  /**
   * Get app pricing information
   */
  async getAppPricing(appId: string): Promise<any> {
    try {
      const data = await this.makeRequest(`/v1/apps/${appId}/appPriceSchedule`);
      
      if (!data.data) return null;

      return {
        id: data.data.id,
        baseTerritory: data.data.attributes?.baseTerritory,
        currency: data.data.attributes?.currency,
        prices: data.included?.map((price: any) => ({
          territory: price.attributes?.territory,
          price: price.attributes?.customerPrice,
          proceeds: price.attributes?.wholesalePrice
        })) || []
      };
    } catch (error: any) {
      console.error('Error getting app pricing:', error);
      throw new Error(`Failed to get app pricing: ${error.message}`);
    }
  }

  /**
   * Get in-app purchases for an app
   */
  async getInAppPurchases(appId: string): Promise<any[]> {
    try {
      const data = await this.makeRequest(`/v1/apps/${appId}/inAppPurchasesV2?limit=200`);
      
      return data.data?.map((iap: any) => ({
        id: iap.id,
        name: iap.attributes.name,
        productId: iap.attributes.productId,
        state: iap.attributes.state,
        inAppPurchaseType: iap.attributes.inAppPurchaseType,
        reviewNote: iap.attributes.reviewNote,
        familySharable: iap.attributes.familySharable,
        contentHosting: iap.attributes.contentHosting,
        availableInAllTerritories: iap.attributes.availableInAllTerritories
      })) || [];
    } catch (error: any) {
      console.error('Error getting in-app purchases:', error);
      throw new Error(`Failed to get in-app purchases: ${error.message}`);
    }
  }

  /**
   * Get app availability information
   */
  async getAppAvailability(appId: string): Promise<any> {
    try {
      const data = await this.makeRequest(`/v1/apps/${appId}/appAvailabilityV2`);
      
      if (!data.data) return null;

      return {
        id: data.data.id,
        availableInNewTerritories: data.data.attributes?.availableInNewTerritories,
        territories: data.included?.map((territory: any) => territory.attributes?.territory) || []
      };
    } catch (error: any) {
      console.error('Error getting app availability:', error);
      throw new Error(`Failed to get app availability: ${error.message}`);
    }
  }

  /**
   * Get app info details including categories and age rating
   */
  async getAppInfoDetails(appId: string): Promise<any> {
    try {
      const data = await this.makeRequest(`/v1/apps/${appId}/appInfos`);
      
      if (!data.data?.[0]) return null;

      const appInfo = data.data[0];
      return {
        id: appInfo.id,
        appStoreState: appInfo.attributes?.appStoreState,
        appStoreAgeRating: appInfo.attributes?.appStoreAgeRating,
        brazilAgeRating: appInfo.attributes?.brazilAgeRating,
        kidsAgeBand: appInfo.attributes?.kidsAgeBand,
        primaryCategory: appInfo.relationships?.primaryCategory?.data?.id,
        primarySubcategoryOne: appInfo.relationships?.primarySubcategoryOne?.data?.id,
        primarySubcategoryTwo: appInfo.relationships?.primarySubcategoryTwo?.data?.id,
        secondaryCategory: appInfo.relationships?.secondaryCategory?.data?.id,
        secondarySubcategoryOne: appInfo.relationships?.secondarySubcategoryOne?.data?.id,
        secondarySubcategoryTwo: appInfo.relationships?.secondarySubcategoryTwo?.data?.id
      };
    } catch (error: any) {
      console.error('Error getting app info details:', error);
      throw new Error(`Failed to get app info details: ${error.message}`);
    }
  }

  // ---- Auto-renewable subscriptions ----

  /** Subscription groups with their subscriptions and en-US style localizations. */
  async listSubscriptionGroups(appId: string): Promise<any[]> {
    const groups = await this.makeRequest(
      `/v1/apps/${appId}/subscriptionGroups?include=subscriptions,subscriptionGroupLocalizations&limit=50`
    );
    const included: any[] = groups.included || [];
    const byType = (type: string) => included.filter((item) => item.type === type);
    const subscriptions = byType('subscriptions');
    const groupLocalizations = byType('subscriptionGroupLocalizations');

    return Promise.all(
      (groups.data || []).map(async (group: any) => {
        const subscriptionIds: string[] = (group.relationships?.subscriptions?.data || []).map((s: any) => s.id);
        const groupLocalizationIds: string[] = (group.relationships?.subscriptionGroupLocalizations?.data || []).map(
          (l: any) => l.id
        );
        return {
          id: group.id,
          referenceName: group.attributes?.referenceName,
          localizations: groupLocalizations
            .filter((l) => groupLocalizationIds.includes(l.id))
            .map((l) => ({ id: l.id, ...l.attributes })),
          subscriptions: await Promise.all(
            subscriptions
              .filter((s) => subscriptionIds.includes(s.id))
              .map(async (s) => ({
                id: s.id,
                referenceName: s.attributes?.name,
                productId: s.attributes?.productId,
                state: s.attributes?.state,
                subscriptionPeriod: s.attributes?.subscriptionPeriod,
                groupLevel: s.attributes?.groupLevel,
                familySharable: s.attributes?.familySharable,
                localizations: await this.listSubscriptionLocalizations(s.id),
              }))
          ),
        };
      })
    );
  }

  async listSubscriptionLocalizations(subscriptionId: string): Promise<any[]> {
    const data = await this.makeRequest(`/v1/subscriptions/${subscriptionId}/subscriptionLocalizations`);
    return (data.data || []).map((l: any) => ({ id: l.id, ...l.attributes }));
  }

  /** Customer-facing subscription name / description for one locale. */
  async updateSubscriptionLocalization(params: {
    localizationId: string;
    name?: string;
    description?: string;
  }): Promise<any> {
    const attributes: Record<string, string> = {};
    if (params.name !== undefined) attributes.name = params.name;
    if (params.description !== undefined) attributes.description = params.description;
    const data = await this.makeRequest(`/v1/subscriptionLocalizations/${params.localizationId}`, {
      method: 'PATCH',
      body: { data: { type: 'subscriptionLocalizations', id: params.localizationId, attributes } },
    });
    return { id: data.data?.id, ...data.data?.attributes };
  }

  async createSubscriptionLocalization(params: {
    subscriptionId: string;
    locale: string;
    name: string;
    description?: string;
  }): Promise<any> {
    const data = await this.makeRequest('/v1/subscriptionLocalizations', {
      method: 'POST',
      body: {
        data: {
          type: 'subscriptionLocalizations',
          attributes: { locale: params.locale, name: params.name, description: params.description },
          relationships: { subscription: { data: { type: 'subscriptions', id: params.subscriptionId } } },
        },
      },
    });
    return { id: data.data?.id, ...data.data?.attributes };
  }

  /** Group display name shown on the App Store subscription page. */
  async updateSubscriptionGroupLocalization(params: {
    localizationId: string;
    name?: string;
    customAppName?: string;
  }): Promise<any> {
    const attributes: Record<string, string> = {};
    if (params.name !== undefined) attributes.name = params.name;
    if (params.customAppName !== undefined) attributes.customAppName = params.customAppName;
    const data = await this.makeRequest(`/v1/subscriptionGroupLocalizations/${params.localizationId}`, {
      method: 'PATCH',
      body: { data: { type: 'subscriptionGroupLocalizations', id: params.localizationId, attributes } },
    });
    return { id: data.data?.id, ...data.data?.attributes };
  }

  /** Reference name and metadata (not customer-facing) of a subscription. */
  async updateSubscription(params: {
    subscriptionId: string;
    referenceName?: string;
    reviewNote?: string;
    familySharable?: boolean;
    groupLevel?: number;
  }): Promise<any> {
    const attributes: Record<string, unknown> = {};
    if (params.referenceName !== undefined) attributes.name = params.referenceName;
    if (params.reviewNote !== undefined) attributes.reviewNote = params.reviewNote;
    if (params.familySharable !== undefined) attributes.familySharable = params.familySharable;
    if (params.groupLevel !== undefined) attributes.groupLevel = params.groupLevel;
    const data = await this.makeRequest(`/v1/subscriptions/${params.subscriptionId}`, {
      method: 'PATCH',
      body: { data: { type: 'subscriptions', id: params.subscriptionId, attributes } },
    });
    return { id: data.data?.id, ...data.data?.attributes };
  }

  async createSubscription(params: {
    groupId: string;
    referenceName: string;
    productId: string;
    subscriptionPeriod: string;
    groupLevel?: number;
    familySharable?: boolean;
    reviewNote?: string;
  }): Promise<any> {
    const data = await this.makeRequest('/v1/subscriptions', {
      method: 'POST',
      body: {
        data: {
          type: 'subscriptions',
          attributes: {
            name: params.referenceName,
            productId: params.productId,
            subscriptionPeriod: params.subscriptionPeriod,
            groupLevel: params.groupLevel,
            familySharable: params.familySharable,
            reviewNote: params.reviewNote,
          },
          relationships: { group: { data: { type: 'subscriptionGroups', id: params.groupId } } },
        },
      },
    });
    return { id: data.data?.id, ...data.data?.attributes };
  }

  /** Price points for one territory; pass customerPrice to filter to a single price. */
  async listSubscriptionPricePoints(params: {
    subscriptionId: string;
    territory: string;
    customerPrice?: string;
  }): Promise<any[]> {
    const points: any[] = [];
    let next: string | null =
      `/v1/subscriptions/${params.subscriptionId}/pricePoints?filter[territory]=${params.territory}&limit=200`;
    while (next) {
      const page: any = await this.makeRequest(next);
      points.push(...(page.data || []));
      const nextUrl: string | undefined = page.links?.next;
      next = nextUrl ? nextUrl.replace(this.baseUrl, '') : null;
    }
    return points
      .map((p) => ({ id: p.id, customerPrice: p.attributes?.customerPrice, proceeds: p.attributes?.proceeds }))
      .filter((p) => params.customerPrice === undefined || p.customerPrice === params.customerPrice);
  }

  async setSubscriptionPrice(params: {
    subscriptionId: string;
    pricePointId: string;
    startDate?: string;
    preserveCurrentPrice?: boolean;
  }): Promise<any> {
    const data = await this.makeRequest('/v1/subscriptionPrices', {
      method: 'POST',
      body: {
        data: {
          type: 'subscriptionPrices',
          attributes: { startDate: params.startDate, preserveCurrentPrice: params.preserveCurrentPrice },
          relationships: {
            subscription: { data: { type: 'subscriptions', id: params.subscriptionId } },
            subscriptionPricePoint: { data: { type: 'subscriptionPricePoints', id: params.pricePointId } },
          },
        },
      },
    });
    return { id: data.data?.id, ...data.data?.attributes };
  }

  async setSubscriptionAvailability(params: {
    subscriptionId: string;
    territories: string[];
    availableInNewTerritories: boolean;
  }): Promise<any> {
    const data = await this.makeRequest('/v1/subscriptionAvailabilities', {
      method: 'POST',
      body: {
        data: {
          type: 'subscriptionAvailabilities',
          attributes: { availableInNewTerritories: params.availableInNewTerritories },
          relationships: {
            subscription: { data: { type: 'subscriptions', id: params.subscriptionId } },
            availableTerritories: {
              data: params.territories.map((id) => ({ type: 'territories', id })),
            },
          },
        },
      },
    });
    return { id: data.data?.id, ...data.data?.attributes };
  }
}