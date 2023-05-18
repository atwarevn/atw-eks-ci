import { Construct } from "constructs";
import { Eks, EksConfig } from "../.gen/modules/eks";
import { EksManagedNodeGroup } from "../.gen/modules/eks-managed-node-group";
import { Karpenter } from "../.gen/modules/karpenter";
import { Fn, Token } from "cdktf";

export type EKSConfig = Required<Pick<EksConfig, "vpcId">> & {
  env: string;
  privateSubnets: string[];
  publicSubnets: string[];
};

export class EKS extends Construct {
  readonly eksCluster: Eks;

  constructor(
    protected scope: Construct,
    protected id: string,
    protected config: EKSConfig
  ) {
    super(scope, id);

    this.eksCluster = new Eks(this.scope, "eks", {
      clusterName: `xxx-${this.config.env}-eks-ci`,
      clusterVersion: "1.26",

      vpcId: this.config.vpcId,
      subnetIds: Fn.concat([
        this.config.publicSubnets,
        this.config.privateSubnets,
      ]),

      clusterEncryptionConfig: [],
      attachClusterEncryptionPolicy: false,
      createKmsKey: false,

      iamRoleName: `xxx-${this.config.env}-role-eks-ci-cluster`,
      iamRoleUseNamePrefix: false,

      clusterSecurityGroupName: `xxx-${this.config.env}-sg-eks-ci-cluster`,
      clusterSecurityGroupUseNamePrefix: false,

      nodeSecurityGroupName: `xxx-${this.config.env}-sg-eks-ci-node-group`,
      nodeSecurityGroupUseNamePrefix: false,
    });

    new EksManagedNodeGroup(this.scope, "eks-node-group", {
      name: `${Token.asString(this.eksCluster.clusterNameOutput)}-node-group`,
      useNamePrefix: false,

      clusterName: Token.asString(this.eksCluster.clusterNameOutput),
      instanceTypes: ["t3.small"],
      amiType: "AL2_x86_64",
      minSize: 1,
      maxSize: 5,
      desiredSize: 3,
      diskSize: 16,
      subnetIds: this.config.privateSubnets,

      iamRoleName: `xxx-${this.config.env}-role-eks-ci-node-group`,
      iamRoleUseNamePrefix: false,

      launchTemplateName: `xxx-${this.config.env}-launch-template-eks-ci`,
      launchTemplateUseNamePrefix: false,

      labels: {
        "service-type": "default",
      },
    });

    new Karpenter(this.scope, "karpenter", {
      clusterName: Token.asString(this.eksCluster.clusterNameOutput),

      irsaUseNamePrefix: false,
      irsaName: `xxx-${this.config.env}-role-eks-ci-karpenter-irsa`,
      irsaOidcProviderArn: Token.asString(
        this.eksCluster.oidcProviderArnOutput
      ),
      irsaNamespaceServiceAccounts: ["karpenter:karpenter"],
      irsaPolicyName: `xxx-${this.config.env}-policy-eks-ci-karpenter-irsa`,

      iamRoleUseNamePrefix: false,
      iamRoleName: `xxx-${this.config.env}-role-eks-ci-karpenter`,

      ruleNamePrefix: `xxx-${this.config.env}-rule-`,

      queueName: `xxx-${this.config.env}-queue-eks-ci-karpenter`,
    });
  }
}
