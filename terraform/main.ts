import { Construct } from "constructs";
import { App, S3Backend, TerraformStack, Token } from "cdktf";
import { AwsProvider } from "@cdktf/provider-aws/lib/provider";
import { TlsProvider } from "@cdktf/provider-tls/lib/provider";
import { Vpc } from "./.gen/modules/vpc";
import { EKS } from "./src/eks";
import { Irsa } from "./src/irsa";

interface StackConfig {
  env: string;
  region: string;
}

class MyStack extends TerraformStack {
  constructor(
    protected scope: Construct,
    protected id: string,
    protected config: StackConfig
  ) {
    super(scope, id);

    this.attachAwsProvider();
    this.attachTlsProvider();
    this.attachS3Backend();

    const vpc = new Vpc(this, "VPC", {
      name: `xxx-${this.config.env}-vpc-operation`,
      cidr: "192.168.0.0/16",
      azs: [`${this.config.region}a`, `${this.config.region}c`],

      publicSubnets: ["192.168.5.0/24", "192.168.6.0/24"],
      publicSubnetTags: {
        tier: "public",
      },
      privateSubnets: ["192.168.1.0/24", "192.168.2.0/24"],
      privateSubnetTags: {
        tier: "private",
      },
      enableNatGateway: true,
      createIgw: true,
    });

    const eksStack = new EKS(this, "EKS", {
      env: this.config.env,
      vpcId: vpc.vpcIdOutput,
      privateSubnets: Token.asList(vpc.privateSubnetsOutput),
      publicSubnets: Token.asList(vpc.publicSubnetsOutput),
    });

    new Irsa(this, "IRSA", {
      env: this.config.env,
      eksOidcProvider: eksStack.eksCluster.oidcProviderOutput,
      eksOidcProviderArn: eksStack.eksCluster.oidcProviderArnOutput,
    });
  }

  attachAwsProvider() {
    new AwsProvider(this, "aws-provider", {
      region: this.config.region,
    });
  }

  attachTlsProvider() {
    new TlsProvider(this, "tls-provider");
  }

  attachS3Backend() {
    new S3Backend(this, {
      region: this.config.region,
      bucket: `xxx-${this.config.env}-tfstate`,
      key: "ci.tfstate",
    });
  }
}

const app = new App();

[
  "dev",
  // ,"stg"
  // ,"prd"
].forEach(
  (env) =>
    new MyStack(app, `${env}-ci-stack`, {
      env,
      region: "ap-northeast-1",
    })
);

app.synth();
